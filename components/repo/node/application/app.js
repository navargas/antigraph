var express = require('express');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var querystring = require('querystring');
var multer = require('multer');
var bodyParser = require('body-parser');
var fmt = require('util').format;
var http = require('http');
var conf = {
    storageDir: '/var/asset-data/'
}
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

/* httpPost used for communicating with authenticator */
function httpPost(hostname, path, port, params, callback) {
    if (!params) params = {};
    var postData = querystring.stringify(params);
    var httpReq = {
        hostname: hostname,
        port: port,
        method: 'POST',
        path: path,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };
    // Send http post to hostname:port
    var buffer = '';
    var req = http.request(httpReq, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            buffer += chunk;
        });
        res.on('end', function() {
            console.log('Status:', res.statusCode);
            if (callback) return callback(res.statusCode, buffer);
        })
    });
    req.write(postData);
    req.end();
}

/* Generic fail response */
function fail(res, message, statusCode) {
    var sc = statusCode || 501;
    res.status(sc).send({
        error: message
    });
}

function uploadFileTarget(req, res) {
    var asset = req.params.assetName;
    var version = req.params.versionName;
    // x-api-key header must be set
    var key = req.headers['x-api-key'];
    if (!asset) return fail(res, 'Asset name field empty');
    if (!key) return fail(res, 'X-API-KEY not set', 401);
    if (!version) return fail(res, 'Version name field empty');
    var group = 'group_dne';
    // attempting to get a path with also create the path
    function getPath(file) {
        var targetPath = path.join(
            conf.storageDir,
            group,
            asset,
            version
        );
        mkdirp.sync(targetPath, 0777);
        return targetPath;
    }
    // store the asset in /var/assets/teamname/assetname/version/filename.ext
    var storage = multer.diskStorage({
        destination: function (req, file, callback) {
            callback(null, getPath(file));
        },
        filename: function (req, file, callback) {
            var filename = file.originalname || 'filename_dne';
            return callback(null, filename);
        }
    });
    var params = {key: key};
    var url = '/auth/repo/' + asset;
    // Fetch the team info from the authenticator
    // Any non-201 status suggests that the user does not have access
    // to the asset.
    httpPost('authenticator', url, 80, params, function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        // The authenticator returns some necessary information in a JSON
        // format. If the response is malformed or missing data, the upload
        // will be blocked.
        try {
            info = JSON.parse(data);
        } catch (e) {
            info = undefined;
        }
        if (!info || !info.team) return res.status(statusCode).send(data);
        // group from function scope
        group = info.team;
        // the actual upload
        multer({storage: storage}).single('upload')(req, res, function(err) {
            if (err) {
                var errorMsg = {error:'There was an issue uploading the file'};
                return res.status(500).send(errorMsg);
            }
            return res.send({status: 'ok'});
        });
    });
}

function fileInfoHeaders(req, res) {
    var asset = req.params.assetName;
    var version = req.params.versionName;
    // x-api-key header must be set
    var key = req.headers['x-api-key'];
    var fileRequestHeader = req.headers['x-file-request'];
    if (!asset) return fail(res, 'Asset name field empty');
    if (!key) return fail(res, 'X-API-KEY not set', 401);
    if (!version) return fail(res, 'Version name field empty');
    var group = 'group_dne';
    var params = {key: key};
    var url = '/auth/repo/' + asset;
    console.log('New get,', asset, version, key);
    httpPost('authenticator', url, 80, params, function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        try {
            info = JSON.parse(data);
        } catch (e) {
            info = undefined;
            console.error('Parse error on:', data);
        }
        if (!info || !info.team) return res.status(statusCode).send(data);
        group = info.team;
        var targetPath = path.join(
            conf.storageDir,
            group,
            asset,
            version
        );
        res.setHeader('X-AUTH-TEAM', group);
        res.setHeader('X-AUTH-ASSET', asset);
        res.setHeader('X-AUTH-VERSION', version);
        fs.readdir(targetPath, function(err, files) {
            if (err && err.code == 'ENOENT') return res.status(404).send({
                asset:asset,
                version:version,
                error: 'Asset/version not found on this server!'
            });
            if (err) return res.status(501).send(err);
            if (files.length == 0) return res.status(404);
            var fileInFiles = (files.indexOf(fileRequestHeader) >= 0);
            if (files.length > 1 && !fileInFiles) return res.status(501).send({
                error: 'Multiple files found. Please specify a file in ' +
                       'the X-FILE-REQUEST header.',
                files: files,
                not_found: fileRequestHeader
            });
            var filename = files[0];
            // it's possible to pick a file from a particular asset
            // it is not yet determined if this should be possible
            if (fileInFiles) filename = fileRequestHeader;
            res.setHeader('X-AUTH-FILENAME', filename);
            res.status(201).send({
                team:group,
                asset:asset,
                version:version,
                filename:filename
            });
        });
    });
}

function getVersions(team, asset, callback) {
    var targetPath = path.join(conf.storageDir, team, asset);
    fs.readdir(targetPath, callback);
}

function getImagesByTeam(team, callback) {
    var targetPath = path.join(conf.storageDir, team);
    var result = [];
    fs.readdir(targetPath, function(err, dir) {
        if (err) return callback(err);
        for (var index in dir) {
            var asset = dir[index];
            (function(asset) {getVersions(team, asset, function(err, vers) {
                result.push({name:asset, versions:vers});
                if (result.length == dir.length) callback(undefined, result);
            })})(asset);
        }
    });
}

function listImages(req, res) {
    var team = req.params.teamname; 
    var error;
    getImagesByTeam(team, function (err, images) {
        if (err) {
            error = err;
            console.error(err);
        }
        res.send({error:error, assets:images});
    });
}


/* for debug */
app.get('/auth', function(req, res) {
    var params = {key: 'abc'};
    var url = '/auth/repo/asset01';
    httpPost('authenticator', url, 80, params, function(status, data) {
        res.send(data);
    });
});
app.get('/accept', function(req, res) {
    res.status(201).send({auth:'ok'});
});
app.get('/reject', function(req, res) {
    res.status(401).send({auth:'no'});
});

/* actual targets */
app.post('/assets/:assetName/:versionName', uploadFileTarget);
app.get('/assets/:assetName/:versionName', fileInfoHeaders);

app.get('/list/:teamname?', listImages);

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
