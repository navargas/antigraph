var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var fmt = require('util').format;
var request = require('request');
var auth = require('./lib/auth');
var db = require('./lib/db');
var app = express();
var validName = /^[a-zA-Z0-9][2:]$/;

var sessionOpts = {
    secret: process.env.sessionsecret || 'bc391664e96a4fc291d4866358b816af',
    resave: false,
    rolling: true,
    cookie: {maxAge:60*60*1000},
    saveUninitialized: false
};
app.use(session(sessionOpts));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

process.on('uncaughtException', function (error) {
    console.error(error.stack);
});

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

function createTeam(name, creator, callback) {
}

var services = [];
if (process.env.USE)
    services = process.env.USE.split('+');

app.post('/login', function(req, res) {
    var email = req.body.email;
    var password = req.body.password;
    console.log('Login from', req.session.email);
    auth.isValidUser(email, password, function(valid, errMsg) {
        if (valid) {
            req.session.email = email;
            res.redirect('/selectteam.html');
        } else {
            res.redirect('/?error=' + (errMsg || ''));
        }
    });
});

app.post('/newteam', function(req, res) {
    var teamName = req.body.team;
    if (!teamName)
        res.status(501).send({error:'Team name required'});
    else if (validName.test(teamName))
        res.status(501).send({error:'Team name invalid'});
    else if (!req.session.email) {
        res.redirect('/?error=Invalid session');
    else
        createTeam(teamName, email, function(err) {
            if (err) {
                res.redirect('/selectteam.html?error=' + err);
            } else {
                res.redirect('/team/' + teamName);
            }
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

app.get('/digest', function(req, res) {
    getAllAssets(services, 'test-team-1', function(data) {
        res.send(data);
    });
});
app.get('/reject', function(req, res) {
    res.status(401).send({auth:'no'});
});

app.use('/', express.static('static'));

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
