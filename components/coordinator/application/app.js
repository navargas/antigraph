var express = require('express');
var crypto = require('crypto');
var session = require('express-session');
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var fmt = require('util').format;
var request = require('request');
var auth = require('./lib/auth');
var db = require('./lib/db');
var app = express();
var validName = /^[a-z0-9\_]{2,}$/;

var sessionOpts = {
    secret: process.env.sessionsecret || 'bc391664e96a4fc291d4866358b816af',
    resave: false,
    rolling: true,
    cookie: {maxAge:60*60*1000},
    saveUninitialized: false
};
app.use(session(sessionOpts));

app.use(require('cookie-parser')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

process.on('uncaughtException', function (error) {
    console.error(error.stack);
});

function typeQuery(type, val) {
    var query = {
        q: fmt('type:"%s" AND value:"%s"', type, val),
        include_docs: true
    };
    return query;
}

var keyCache = {};
function getKeyDoc(key, callback) {
    var query = typeQuery('key', key);
    var now = Date.now();
    var tenMin = 1000 * 60 * 10;
    if (keyCache[key] && keyCache[key].expire > now) {
        console.log('Cache hit', key, 'expires', keyCache[key].expire);
        return callback(null, keyCache[key].doc);
    }
    db().search('design', 'typeValue', query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.total_rows === 0)
            return callback({error:'key_does_not_exist'});
        keyCache[key] = {expire: Date.now() + tenMin, doc: value.rows[0].doc};
        callback(null, value.rows[0].doc);
    });
}

function getMembers(team, callback) {
    var query = typeQuery('membership', team);
    db().search('design', 'typeValue', query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.total_rows === 0)
            return callback({error:'key_does_not_exist'});
        var result = value.rows.map((obj) => {return obj.doc.member});
        callback(null, result);
    });
}

function getAssets(service, team, callback) {
    request('http://'+service+'/list/'+team, function(error, res, body) {
        if (error) return callback(error);
        var data;
        try {
            data = JSON.parse(body);
        } catch (e) {
            return callback(error);
        }
        callback(undefined, data);
    });
}

function getAllAssets(services, team, callback) {
    var result = {};
    for (var index in services) {
        (function(service) {
            var serviceHost = service.split('/')[0];
            var serviceName = service.split('/')[1];
            getAssets(serviceHost, team, function(err, assets) {
                if (err)
                    result[serviceName] = {error:err};
                else
                    result[serviceName] = assets;
                if (Object.keys(result).length == services.length)
                    callback(result);
            });
        })(services[index]);
    }
}

function teamManifest(team, callback) {
    console.log('ma', team);
    function format(nested) {
        var finalArr = [];
        // join arrays
        nested.map((o) => {finalArr = finalArr.concat(o);});
        return finalArr;
    }
    var results = [];
    var queries = [
        {type:'team', q:fmt('team:"%s"',team)},
        {type:'typeValue', q:fmt('type:"team" AND value:"%s"',team)},
        {type:'typeValue', q:fmt('type:"membership" AND value:"%s"',team)}
    ];
    for (var queryType in queries) {
        ((query)=>{
            var reqquery = {q:query.q, include_docs: true};
            db().search('design', query.type, reqquery, function(err, value) {
                if (err) {
                    console.error(err);
                    results.push([]);
                } else {
                    var rows = value.rows.map((obj)=>{return obj.doc});
                    results.push(rows);
                }
                if (results.length === queries.length) {
                    callback(format(results));
                }
            })
        })(queries[queryType]);
    }
}

function pollEnv(callback) {
    var cluster = process.env.GEO.split('+');
}

function createTeam(name, creator, callback) {
    var luc = fmt('type:"team" AND value:"%s"', name);
    var query = {q:luc, include_docs:true};
    db().search('design', 'typeValue', query, function(err, data) {
        console.log(err, data);
        if (err)
            return callback(err);
        if (data.total_rows > 0)
            return callback(fmt('Team name "%s" already exits', name));
        var teamDoc = {
            type: 'team',
            value: name,
            creator: creator
        };
        var memberDoc = {
            type: 'membership',
            value: name,
            member: creator,
            admin: true
        };
        db().insert(teamDoc, function(err, value) {
            if (err)
                return callback(err);
            db().insert(memberDoc, function(err, value) {
                if (err)
                    return callback(err);
                callback(null);
            });
        });
    });
}

var services = [];
if (process.env.SERVICES)
    services = process.env.SERVICES.split('+');

app.post('/login', function(req, res) {
    var email = req.body.email;
    var password = req.body.password;
    auth.isValidUser(email, password, function(valid, errMsg) {
        console.log(email, password, valid);
        if (valid) {
            req.session.email = email;
            res.redirect('/');
        } else {
            res.redirect('/?error=' + (errMsg || ''));
        }
    });
});
app.post('/uploadkey', function(req, res) {
    var key = req.body.key;
    function fail(res, error) {
        req.session.email = undefined;
        req.session.key = undefined;
        var errMsg = '';
        if (error) errMsg = '?error='+error;
        return res.redirect('/' + errMsg);
    }
    if (!key) {
        return fail(res, 'Key required');
    }
    getKeyDoc(key, function(err, doc) {
        if (err) return fail(res, 'Unable to find key'); 
        req.session.email = doc.creator;
        req.session.key = key;
        res.cookie('apikey', key, { maxAge: 900000 });
        return res.redirect('/');
    });
});
app.all('/createkey/:team', function(req, res) {
    var team = req.params.team; 
    var email = req.session.email;
    var luc = fmt(
        'type:"membership" AND value:"%s" AND member:"%s"',
        team, email
    );
    var query = {q:luc, include_docs:true};
    db().search('design', 'typeValueMember', query, function(err, data) {
        if (err) {
            console.error(err);
            return res.redirect('/?error='+err);
        } else if (data.total_rows === 0) {
            return res.redirect('/?error=You are not a member of this team');
        }
        var key = {
            type: 'key',
            value: crypto.randomBytes(16).toString('hex'),
            creator: email,
            valid: 'true',
            team: team
        }
        db().insert(key, function(err, data) {
            if (err) {
                console.error(err);
                return res.redirect('/?error='+err);
            }
            res.cookie('apikey', key.value, { maxAge: 900000 });
            res.cookie('signal_key', key.value, { maxAge: 900000 });
            req.session.key = key.value;
            res.redirect('/');
        });
    });
});
app.all('/signout', function(req, res) {
    req.session.email = undefined;
    req.session.key = undefined;
    res.clearCookie('apikey');
    res.redirect('/');
});
app.delete('/team', function(req, res) {
    getKeyDoc(req.session.key, function(err, doc) {
        if (err) {
            console.error(err);
            return res.status(501).send({error:'Could not delete team'});
        }
        teamManifest(doc.team, function(docs) {
            docs.map((o) => {o._deleted=true});
            db().bulk({docs:docs}, function(err, data) {
                if (err) {
                    console.error(err);
                    res.status(501).end();
                }
                keyCache[req.session.key] = undefined;
                return res.status(201).send();
            });
        });
    });
});

app.post('/newteam', function(req, res) {
    var teamName = req.body.team;
    if (!teamName) {
        res.status(501).send({error:'Team name required'});
    } else if (!validName.test(teamName)) {
        var errMsg = fmt('Invalid team name %s. '+
            'Must be lowercase alphanumeric or underscore', teamName);
        res.redirect('/?error=' + errMsg);
    } else if (!req.session.email) {
        res.redirect('/?error=Invalid session');
    } else createTeam(teamName, req.session.email, function(err) {
        if (err) {
            res.redirect('/?error=' + err);
        } else {
            res.redirect('/');
        }
    });
});

app.post('/members', function(req, res) {
    var member = req.body.email;
    if (!member) return res.status(501).send({error:'Member not found'});
    getKeyDoc(req.session.key, function(err, doc) {
        if (err) return res.status(501).send(err);
        var memberDoc = {
            type: 'membership',
            value: doc.team,
            member: member,
            admin: true
        };
        db().insert(memberDoc, function(err, data) {
            if (err) return res.status(501).send(err);
            res.redirect('/');
        });
    });
});
app.get('/members', function(req, res) {
    if (!req.session.key)
        return res.status(501).send({error:'Invalid key'});
    getKeyDoc(req.session.key, function(err, keydoc) {
        if (err)
            return res.status(501).send({error:'DB Error', more:err});
        if (!keydoc.valid)
            return res.status(501).send({errror:'Invalid key'});
        getMembers(keydoc.team, function(err, members) {
            if (err)
                return res.status(501).send({error:'DB Error', more:err});
            res.send(members);
        });
    });
});
app.get('/teams', function(req, res) {
    var query = {q:'type:"team"', include_docs:true};
    db().search('design', 'type', query, function(err, value) {
        if (err) return res.status(501).send({error:err});
        var result = value.rows.map((obj) => {
            return {name:obj.doc.value, creator:obj.doc.creator}
        });
        res.status(200).send(result);
    });
});
app.get('/manifest', function(req, res) {
    getKeyDoc(req.session.key, function(err, keydoc) {
        if (err) return res.status(501).send(err);
        getAllAssets(services, keydoc.team, function(data) {
            res.send(data);
        });
    });
});
app.get('/digest', function(req, res) {
    getKeyDoc(req.session.key, function(err, keydoc) {
        if (err) return res.status(501).send(err);
        getAllAssets(services, keydoc.team, function(data) {
            var services = Object.keys(data);
            var result = [];
            // Sort services alphabetically so interface is consistent
            services.sort();
            for (var index in services) {
                data[services[index]].service = services[index];
                result.push(data[services[index]]);
            }
            res.send(result);
        });
    });
});
app.get('/', function(req, res) {
    console.log(req.session.email, req.session.key);
    if (!req.session.key && req.cookies.apikey)
        req.session.key = req.cookies.apikey;
    if (req.session.key) getKeyDoc(req.session.key, function(err, keydoc) {
        if (!err)
            return res.sendFile('static/team.html' , { root : __dirname});
        req.session.key = undefined;
        req.session.email = undefined;
        res.clearCookie('apikey');
        res.sendFile('static/index.html' , { root : __dirname});
    });
    else if (req.session.email)
        res.sendFile('static/selectteam.html' , { root : __dirname});
    else
        res.sendFile('static/index.html' , { root : __dirname});
});
app.use('/', express.static('static'));

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
