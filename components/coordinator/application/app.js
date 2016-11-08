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
var t_hour = 1000 * 60 * 60;

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

function getMembers(team, fullDocs, callback) {
    var query = {
        'selector': {
            '_id': { '$gt': 0 },
            'type': { '$eq':'membership' },
            'value': { '$eq':team }
        }
    };
    db().find(query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.docs.length === 0)
            return callback({error:'key_does_not_exist'});
        if (fullDocs)
            return callback(null, value.docs);
        var result = value.docs.map((obj) => {return obj.member});
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

function getRemoteAssets(target, key, callback) {
    var domain = target[0];
    var name = target[1];
    var ssl = target[2];
    if (domain === process.env.THISNODE) {
        domain = 'localhost';
        ssl = false;
    }
    var url = 'http' + (ssl ? 's':'') + '://'+ domain + '/digest';
    var req = {
        url: url,
        timeout: 3000,
        headers: {'x-api-key': key, nofmt:'yes'}
    }
    request(req, function(err, res, body) {
        console.log(target, body);
        if (err) return callback(err);
        var obj = undefined;
        try {
            obj = JSON.parse(body)
        } catch(e) {
            return callback(e);
        }
        callback(null, obj);
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

function getKeysByCreator(team, creator, callback) {
    var query = {
        selector: {
            _id: {$gt: 0},
            type: {$eq:'key'},
            team: {$eq:team},
            creator: {$eq:creator}
        }
    };
    db().find(query, (err, data) => {
        if (err) return callback(err);
        callback(null, data.docs);
    });
}

function teamManifest(team, callback) {
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
function formDigestData(all, serviceLegend) {
    var legend = Object.keys(all);
    var offline = [];
    var allServices = {};
    for (var serviceIndex in serviceLegend) {
        var serviceIndex = serviceLegend[serviceIndex];
        var join = {};
        for (var key in all) {
            console.log(key, serviceIndex);
            var obj = all[key][serviceIndex];
            if (!obj) {
                offline.push([key, serviceIndex, 'timeout']);
                continue;
            }
            if (obj.error) {
                offline.push([key, serviceIndex, obj.error]);
                continue;
            }
            var geo = key;
            for (var assetKey in obj.assets) {
                var asset = obj.assets[assetKey];
                if (!asset.name) continue;
                if (!join[asset.name]) join[asset.name] = {};
                for (var versionKey in asset.versions) {
                    var version = asset.versions[versionKey];
                    if (!join[asset.name][version]) {
                        var spec = Array(legend.length);
                        legend.map((key)=>{spec[legend.indexOf(key)]=false});
                        join[asset.name][version] = spec;
                    }
                    join[asset.name][version][legend.indexOf(geo)] = true;
                }
            }
        }
        allServices[serviceIndex] = join;
    }
    return {assets:allServices, legend:legend, offline:offline};;
}

var services = [];
var SERVICES = [];
if (process.env.SERVICES) {
    services = process.env.SERVICES.split('+');
    SERVICES = process.env.SERVICES.split('+');
}
for (var ix in SERVICES) {
    SERVICES[ix] = SERVICES[ix].split('/');
}

var geo = [];
if (process.env.GEO)
    geo = process.env.GEO.split('+');
for (var ix in geo) {
    geo[ix] = geo[ix].split('/');
}

// If debug is enabled replace all targets w/ localhost
if (process.env.DEBUG == 'yes') geo.map((o) => {
    o[0] = 'localhost';
    o[2] = undefined;
});
console.log('Using cluster', geo);

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
app.post('/key/readonly', function(req, res) {
    var key = req.headers['x-api-key'];
    // Key will only be read from header, not cookies or session
    if (!key) return res.status(501).send({
        error:'Key must be set in X-API-KEY header to be made readonly'
    });
    auth.getKeyDoc(key, function(err, doc) {
        if (err) {
            var msg = 'Unable to find key';
            return res.status(501).send({error:msg});
        } else if (doc.readonly) {
            var msg = 'This key is already readonly';
            return res.status(501).send({error:msg});
        }
        doc.readonly = true;
        db().insert(doc, doc._id, function(err, data) {
            if (err) {
                console.error('Issue setting key as read only!', err);
                return res.status(501).send(err);
            }
            res.send({'status':'readonly set'});
        });
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
    auth.getKeyDoc(key, function(err, doc) {
        if (err) return fail(res, 'Unable to find key');
        if (doc.readonly)
            return fail(res, 'This key is read only');
        req.session.email = doc.creator;
        req.session.key = key;
        res.cookie('apikey', key, { maxAge: 1000 * 60 * 60 * 24 });
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
            created: Date.now(),
            valid: 'true',
            team: team
        }
        db().insert(key, function(err, data) {
            if (err) {
                console.error(err);
                return res.redirect('/?error='+err);
            }
            res.cookie('apikey', key.value, { maxAge: 1000 * 60 * 60 * 24 });
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
app.delete('/team', auth.verify, function(req, res) {
    teamManifest(req.keydoc.team, function(docs) {
        docs.map((o) => {o._deleted=true});
        db().bulk({docs:docs}, function(err, data) {
            if (err) {
                console.error(err);
                res.status(501).end();
            }
            auth.invalidateKey(req.keydoc.value);
            return res.status(201).send();
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
app.delete('/members/:member', auth.verify, function(req, res) {
    var target = req.params.member;
    if (target == req.keydoc.creator)
        return res.status(501).send({error:'Cannot delete self'});
    getMembers(req.keydoc.team, true, function(err, members) {
        if (err)
            return res.status(501).send({error:'DB Error', more:err});
        var targetDoc;
        // create an array of email strings, setting targetDoc to the
        // full document of the target membership
        members = members.map(o => {
            if (o.member == target)
                targetDoc = o;
            else
                return o.member;
        }).filter(o => {return o});
        db().destroy(targetDoc._id, targetDoc._rev, (err, body) => {
            if (err) return res.status(501).send(err);
            getKeysByCreator(req.keydoc.team, target, (err, docs) => {
                if (err) return res.status(501).send(err);
                docs.map((o) => {o._deleted=true});
                db().bulk({docs:docs}, (err, data) => {
                    console.log('Also deleting', docs);
                    res.send(members);
                });
            });
        });
    });
});
app.post('/members', auth.verify, function(req, res) {
    var member = req.body.email;
    if (!member) return res.status(501).send({error:'Member not found'});
    var memberDoc = {
        type: 'membership',
        value: req.keydoc.team,
        member: member,
        admin: true
    };
    db().insert(memberDoc, function(err, data) {
        if (err) return res.status(501).send(err);
        res.redirect('/');
    });
});
app.get('/members', auth.verify, function(req, res) {
    getMembers(req.keydoc.team, false, function(err, members) {
        if (err)
            return res.status(501).send({error:'DB Error', more:err});
        res.send(members);
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
app.get('/manifest', auth.verify, function(req, res) {
    var results = {};
    for (var ix in geo) {
        ((target)=> {
            getRemoteAssets(geo[ix], req.keydoc.value, function(err, data) {
                if (err)
                    results[target[1]] = {};
                else
                    results[target[1]] = data;
                if (Object.keys(results).length == geo.length) {
                    var serviceLegend = services.map((o)=>{
                        return o.split('/')[1];
                    });
                    console.log(results, serviceLegend);
                    var displayForm = formDigestData(results, serviceLegend);
                    res.send(displayForm);
                }
            })
        })(geo[ix]);
    }
});
app.get('/digest', auth.verify, function(req, res) {
    var nofmt = req.headers.nofmt;
    getAllAssets(services, req.keydoc.team, function(data) {
        if (nofmt) return res.send(data);
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
function translateService(display) {
    console.log(display, 'in', SERVICES);
    for (var ix in SERVICES) {
        console.log(ix, 'is', SERVICES[ix][1]);
        if (SERVICES[ix][1] == display) return SERVICES[ix][0];
    }
}
function translateGeo(display) {
    for (var ix in geo) {
        if (geo[ix][1] == display) return geo[ix][0];
    }
}
app.delete('/transfers/:id', auth.verify, function(req, res) {
    var query = {
      "selector": {
        "_id": {"$eq": req.params.id},
        "type": {
          "$eq":'transfer'
        },
        "team": {
          "$eq":req.keydoc.team
        }
      }
    };
    db().find(query, function(err, data) {
        if (err) return res.status(501).send(err);
        var doc = data.docs[0];
        if (!doc) return res.status(404).send({error:'Asset not found'});
        doc.active = false;
        db().insert(doc, doc._id, function(err, data) {
            if (err) return res.status(501).send(err);
            res.status(200).send({status: 'done'});
        });
    });
});
app.get('/transfers/:id', auth.verify, function(req, res) {
    if (req.query.format == 'html') {
        return res.sendFile('static/transfer.html' , { root : __dirname});
    }
    var query = {
      "selector": {
        "_id": {"$eq": req.params.id},
        "type": {
          "$eq":'transfer'
        },
        "team": {
          "$eq":req.keydoc.team
        }
      }
    };
    var updatesQuery = {
        "selector": {
            "time": {"$gt": 0},
            "type": {
                "$eq":'transferUpdate'
            },
            "value": {
                "$eq":req.params.id
            }
        },
        "sort": [{
            "time": "desc"
        }]
    };
    db().find(query, function(err, data) {
        if (err) return res.status(501).send(err);
        // remove API key
        data.docs.map((o) => {o.key = undefined});
        db().find(updatesQuery, function(err, updates) {
            if (err) return res.status(501).send(err);
            res.status(200).send({info:data.docs[0], updates:updates.docs});
        });
    });
});
app.get('/transfers', auth.verify, function(req, res) {
    var query = {
        "selector": {
            "time": {"$gt": Date.now() - t_hour * 24},
            "type": {
                "$eq":'transfer'
            },
            "active": {
                "$eq":true
            },
            "team": {
                "$eq":req.keydoc.team
            }
        },
        "sort": [{
            "time": "desc"
        }]
    };
    if (req.query.all == 'yes') {
        query.selector.time["$gt"] = 0;
        delete query.selector["active"];
    }
    console.log(query);
    db().find(query, function(err, data) {
        if (err) return res.status(501).send(err);
        // remove API key
        data.docs.map((o) => {o.key = undefined});
        res.status(200).send(data.docs);
    });
});
// Every 10 seconds check for transfers
setInterval(function() {
    var query = {
      "selector": {
        "_id": {"$gt": 0},
        "type": {
          "$eq":'transfer'
        },
        "source": {
          "$eq":process.env.THISNODE
        },
        "started": {
          "$eq":false
        }
      }
    };
    db().find(query, function(err, data) {
        if (err) return console.error(err);
        var current = data.docs[0];
        if (!current) return;
        console.log('Starting transfer', current);
        current.started = true;
        var stat = fmt('Started at %s by %s', Date.now(), process.env.THISNODE);
        current.updates.push(stat);
        db().insert(current, current._id, function(err, data) {
            if (err) {
                console.error(err);
                return;
            }
            console.log('data', data);
            current._rev = data.rev;
            var req = {
                url: 'http://' + current.service + '/transfer',
                method: 'POST',
                timeout: 1000 * 60 * 60 * 2,
                json: current
            };
            console.log('Sending transfer');
            request(req, function(err, res, body) {
                var doc;
                if (typeof(body) == 'object') {
                    doc = body;
                } else {
                    doc = current;
                }
                if (err) {
                    var stat = fmt(
                        'Error at %s: %s',
                        Date.now(), JSON.stringify(err)
                    );
                    doc.updates.push(stat);
                    doc.failed = true;
                } else {
                    doc.updates.push(fmt('Done at %s', Date.now()));
                    doc.finished = true;
                }
                console.log('final', doc);
                db().insert(doc, doc._id, function(err, data) {
                    if (err) console.error(err);
                });
            });
        });
    });

}, 1000 * 10);
app.post('/transfers', auth.verify, function(req, res) {
    var transferDoc = {
        type: 'transfer',
        service: translateService(req.body.service),
        asset: req.body.asset,
        time: Date.now(),
        version: req.body.version,
        target: translateGeo(req.body.target),
        source: translateGeo(req.body.source),
        delete: req.body.delete,
        active: true,
        started: false,
        finished: false,
        updates: [],
        key: req.keydoc.value,
        team: req.keydoc.team,
        creator: req.keydoc.creator
    }
    console.log('New transfer request', transferDoc);
    var missingError = 'A required attribute was not set';
    if (!transferDoc.service || !transferDoc.asset ||
        !transferDoc.version || !transferDoc.source)
            return res.status(501).send({error:missingError});
    db().insert(transferDoc, function(err, value){
        if (err) {
            console.error(err);
            return res.status(501).send(err);
        }
        console.log('New Transfer', transferDoc);
        // remove key and echo doc
        transferDoc.key = undefined;
        res.status(200).send(transferDoc);
    });
});
app.get('/', function(req, res) {
    console.log(req.session.email, req.session.key);
    if (!req.session.key && req.cookies.apikey)
        req.session.key = req.cookies.apikey;
    if (req.session.key) auth.getKeyDoc(req.session.key, function(err, keydoc) {
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
