var express = require('express');
var bodyParser = require('body-parser');
var fmt = require('util').format;
require('dotenv').config();

var dbauth = {
    account: process.env.CLOUDANT_ACCOUNT,
    username: process.env.CLOUDANT_ACCOUNT,
    password: process.env.CLOUDANT_PASSWORD
}

var cloudant;
var DBNAME = 'antigraph';
function connect() {
    require('cloudant')(dbauth, function(err, dbcon) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        cloudant = dbcon;
    });
}

// establish connection
connect();
// reopen connection every 23 hours
setInterval(connect, 1000 * 60 * 60 * 23);

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

function testUnique(number, desc) {
    if (number > 1) console.error('Muliple keys found for', desc);
}

function rejectAccess(req, res) {
    res.status(401).send({access:'no'});
}

function acceptNewAsset(service, keydoc, asset, req, res) {
    var db = cloudant.use(DBNAME);
    var asset = {
        type: 'asset',
        value: asset,
        authenticatedKey: keydoc._id,
        service: service,
        team: keydoc.team
    }
    console.log('newdoc', asset);
    db.insert(asset, function(err, value) {
        if (err) {
            console.error(err);
            return rejectAccess(req, res);
        }
        console.log(value);
        res.status(201).send({access:'ok', type:'new_asset'});
    })
}

function acceptAccess(req, res) {
    res.status(201).send({access:'ok', type:'existing_asset'});
}

function typeQuery(type, val) {
    var query = {q:fmt('type:"%s" AND value:"%s"', type, val), include_docs:true};
    return query;
}

function getKeyDoc(key, callback) {
    var db = cloudant.use(DBNAME);
    var query = typeQuery('key', key);
    db.search('design', 'typeValue', query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.total_rows === 0) return callback({error:'does_not_exist'});
        testUnique(value.total_rows, 'api key in getKeyDoc');
        // If there is a result (will be only one unique doc) return it
        callback(null, value.rows[0].doc);
    });
}

function getAsset(team, service, asset, callback) {
    var db = cloudant.use(DBNAME);
    var qStr = 'type:"%s" AND value:"%s" AND team:"%s" AND service:"%s"';
    var query = {
        q: fmt(qStr, 'asset', asset, team, service),
        include_docs: true
    };
    db.search('design', 'typeValueTeamService', query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.total_rows === 0) return callback({error:'asset_does_not_exist'});
        testUnique(value.total_rows, 'assets in getAsset');
        // If there is a result (will be only one unique doc) return it
        callback(null, value.rows[0].doc);
    });
}

app.get('/', function (req, res) {
    res.send({version:'v1.0.0', service:'authenticator'});
});

app.post('/auth/:service/:asset/', function (req, res) {
    var db = cloudant.use(DBNAME);
    var key = req.body.key;
    var service = req.params.service;
    var asset = req.params.asset;
    getKeyDoc(key, function(err, keydoc) {
        if (err) {
            console.error(err);
            return rejectAccess(req, res);
        }
        if (!keydoc.valid) {
            return rejectAccess(req, res);
        }
        getAsset(keydoc.team, service, asset, function(err, assetDoc) {
            if (err && err.error == 'asset_does_not_exist') {
                return acceptNewAsset(service, keydoc, asset, req, res);
            }
            if (err) {
                console.error(err);
                return rejectAccess(req, res);
            }
            acceptAccess(req, res);
        });
    });
});

app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
