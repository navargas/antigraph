var express = require('express');
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
    /* send http post to hostname:port */
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

function fail(res, message, statusCode) {
    var sc = statusCode || 501;
    res.status(sc).send({
        error: message
    });
}

function uploadFileTarget(req, res) {
    var asset = req.params.assetName;
    var key = req.headers['x-api-key'];
    if (!asset) return fail(res, 'Asset name field empty');
    if (!key) return fail(res, 'X-API-KEY not set', 401);
    var authUrl = 'http://authenticator/repo/' + asset;
}

function uploadFileTarget(req, res) {
    /* Store asset in [storageDir]/team/asset/version/filename.ext */
    var assetPath = path.join(
        conf.storageDir,
        req.params.assetName
    );
    var fileName = req.params.assetName;
    if (!fs.existsSync(assetPath)){
        fs.mkdirSync(assetPath);
    }
    /* Create fs storage callbacks */
    var storage = multer.diskStorage({
        destination: function (req, file, callback) {
            callback(null, assetPath);
        },
        filename: function (req, file, callback) {
            var params = [
                req.params.assetName,   // asset name
                req.params.versionName, // version
                file.originalname       // displayName
            ];
            db().run(SQL_NEW_FILE, params, function(err) {
                if (err)
                    return callback(err);
                else
                    return callback(null, req.params.versionName);
            });
        }
    });
    /* multer(...).single(<filename>) returns a middleware router */
    multer({storage: storage}).single('upload')(req, res, function(err) {
        if (err) {
            return res.status(500).send(
                {error: 'There was an issue uploading the file'}
            );
        }
        res.syncTarget = fileName;
        return res.send({status: 'ok'});
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

app.post('/upload', uploadFileTarget);

app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
