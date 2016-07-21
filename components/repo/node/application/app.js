var express = require('express');
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
    var group = 'group_dne';
    // attempting to get a path with also create the path
    function getPath(file) {
        var targetPath = path.join(
            conf.storageDir,
            group,
            asset,
            version
        );
        mkdirp.sync(targetPath, 600);
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
                var errorMsg = {error: 'There was an issue uploading the file'};
                return res.status(500).send(errorMsg);
            }
            return res.send({status: 'ok'});
        });
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

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
