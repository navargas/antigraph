var express = require('express');
var bodyParser = require('body-parser');
var fmt = require('util').format;

var uriNoTeam = /^\/v2\/([a-z0-9]+(?:[._-][a-z0-9]+)*.)\/(manifests|blobs|tags)\/.*$/;
var uriValid = /^\/v2\/([a-z0-9\-]+(?:[._-][a-z0-9]+)*.)\/([a-z0-9\-]+(?:[._-][a-z0-9]+)*.)\/(manifests|blobs|tags)\/.*$/;

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
    console.log('Rejected');
    res.status(403).send({access:'no'});
}

function setInfoHeaders(keydoc, asset, res) {
    res.header('X-AUTH-TEAM', keydoc.team);
    res.header('X-AUTH-ASSET', asset);
    return {team: keydoc.team, asset: asset};
}

function acceptNewAsset(service, keydoc, asset, req, res) {
    console.log('Accepted');
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
        var info = setInfoHeaders(keydoc, asset, res);
        info.access = 'ok';
        info.type = 'new_asset';
        res.status(201).send(info);
    })
}

function acceptAccess(service, keydoc, asset, req, res) {
    setInfoHeaders(keydoc, asset, res);
    var info = setInfoHeaders(keydoc, asset, res);
    info.access = 'ok';
    info.type = 'existing_asset';
    info.key = keydoc;
    res.status(201).send(info);
}

function typeQuery(type, val) {
    var query = {
        q: fmt('type:"%s" AND value:"%s"', type, val),
        include_docs: true
    };
    return query;
}

var keyCache = {};
function getKeyDoc(key, callback) {
    var db = cloudant.use(DBNAME);
    var query = typeQuery('key', key);
    var now = Date.now();
    var tenMin = 1000 * 60 * 10;
    if (keyCache[key] && keyCache[key].expire > now) {
        console.log('Cache hit', key, 'expires', keyCache[key].expire);
        return callback(null, keyCache[key].doc);
    }
    db.search('design', 'typeValue', query, function(err, value) {
        if (err) return callback(err);
        // if there are no rows return does_not_exist
        if (value.total_rows === 0)
            return callback({error:'key_does_not_exist'});
        testUnique(value.total_rows, 'api key in getKeyDoc');
        // If there is a result (will be only one unique doc) return it
        keyCache[key] = {expire: Date.now() + tenMin, doc: value.rows[0].doc};
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
        if (value.total_rows === 0)
            return callback({error:'asset_does_not_exist'});
        testUnique(value.total_rows, 'assets in getAsset');
        // If there is a result (will be only one unique doc) return it
        callback(null, value.rows[0].doc);
    });
}

app.get('/', function (req, res) {
    res.send({version:'v1.0.0', service:'authenticator'});
});

function authReq(req, res) {
    var db = cloudant.use(DBNAME);
    console.log(req.body);
    var key = req.body.key || req.query.key || req.headers['x-api-key'];
    var service = req.params.service;
    var asset = req.params.asset;
    console.log('Request for <%s>/%s using %s', service, asset, key);
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
            acceptAccess(service, keydoc, asset, req, res);
        });
    });
}

function uriAuth(req, res) {
    var uri = req.headers['x-original-uri'];
    var method = req.headers['x-original-method'];
    if (!req.headers || !req.headers.authorization) {
        console.log('headers', req.headers);
        res.append('WWW-Authenticate', 'Basic');
        return res.status(401).end();
    }
    var auth = req.headers.authorization;
    var decode = new Buffer(auth.split(' ')[1], 'base64').toString('ascii');
    var username = decode.split(':')[0];
    var key = decode.split(':')[1];
    console.log(username, key, uri, method);
    // if the user is doing a non-action, like catalog or ping, allow
    if (uri == '/v2/_catalog' || uri == '/v2/_catalog') {
        return res.status(201).end();
    }
    // if the user is attempting to upload a team-less image, block
    if (uriNoTeam.test(uri)) {
        console.log('Team not found', uri);
        return rejectAccess(req, res);
    }
    // finnally if the uri is invalid, reject
    if (!uriValid.test(uri) && uri !== '/v2/') {
        console.log('Invalid URI', uri);
        return rejectAccess(req, res);
    }
    getKeyDoc(key, function(err, keydoc) {
        if (err) {
            console.error(err);
            return rejectAccess(req, res);
        }
        if (keydoc.readonly && (method != 'HEAD' && method != 'GET')) {
            return rejectAccess(req, res);
        }
        if (!keydoc.valid) {
            return rejectAccess(req, res);
        }
        if (uri == '/v2/') {
            return res.status(201).end();
        }
        var match = uriValid.exec(uri);
        var team = match[1];
        var asset = match[2];
        var service = 'docker';
        if (keydoc.team != team) {
            console.error('Team mis-match', team, keydoc.team);
            return rejectAccess(req, res);
        }
        return res.status(201).end();
    });
}

/* for debug */
app.post('/reject/:service/:asset/', rejectAccess);
app.get('/reject/:service/:asset/', rejectAccess);

app.post('/auth/:service/:asset/', authReq);
app.get('/auth/:service/:asset/', authReq);

app.post('/uriauth', uriAuth);
app.get('/uriauth', uriAuth);

app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
