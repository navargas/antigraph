var express = require('express');
var sp = require('simple-post')(process.env.EVENTS);
var md5 = require('md5-file');
var fs = require('fs');
var exec = require('child_process').exec;
var path = require('path');
var mkdirp = require('mkdirp');
var multer = require('multer');
var bodyParser = require('body-parser');
var fmt = require('util').format;
var db = require('./lib/db');
var partials = require('./lib/partials');
var conf = {
    storageDir: '/var/asset-data/'
}
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

function filterSystemFiles(array) {
    var files = ['__md5', '__activeUpload'];
    return array.filter((o) => {
        console.log(o, files.indexOf(o));
        if (files.indexOf(o) >= 0)
            {return false;}
        else
            {return true;}
    });
}


function uploadFileTarget(req, res) {
    var asset = req.params.assetName;
    var version = req.params.versionName;
    var ip = req.headers['x-real-ip'];
    // x-api-key header must be set
    var key = req.headers['x-api-key'];
    if (!asset) return partails.fail(res, 'Asset name field empty');
    if (!key) return partails.fail(res, 'X-API-KEY not set', 401);
    if (!version) return partails.fail(res, 'Version name field empty');
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
    var originalPath;
    var originalFilename = 'filename_dne_error';
    // store the asset in /var/assets/teamname/assetname/version/__activeUpload
    var storage = multer.diskStorage({
        destination: function (req, file, callback) {
            originalPath = getPath(file);
            callback(null, originalPath);
        },
        filename: function (req, file, callback) {
            originalFilename = file.originalname || 'filename_dne';
            return callback(null, '__activeUpload');
        }
    });
    var params = {key: key};
    var url = '/auth/repo/' + asset;
    // Fetch the team info from the authenticator
    // Any non-201 status suggests that the user does not have access
    // to the asset.
    partials.httpPost('authenticator', url, 80, params, function(statusCode, data) {
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
        if (info.key && info.key.readonly) {
            return res.status(403).send({error:'Readonly key'});
        }
        // group from function scope
        group = info.team;
        // the actual upload
        multer({storage: storage}).single('upload')(req, res, function(err) {
            if (err) {
                var errorMsg = {error:'There was an issue uploading the file'};
                return res.status(500).send(errorMsg);
            }
            var tmpPath = path.join(originalPath, '__activeUpload');
            var newPath = path.join(originalPath, originalFilename);
            var md5Path = path.join(originalPath, '__md5');
            fs.rename(tmpPath, newPath, function(err, data) {
                if (err) console.error(err);
                else md5(newPath, (md5err, md5sum)=>{
                    if (md5err) {
                        console.error(md5err);
                        md5sum = 'Error! Could not compute sum';
                    }
                    fs.writeFile(md5Path, md5sum, function(ferr) {
                        if(ferr) {
                            return console.log(ferr);
                        }
                        sp({
                            type:'upload',
                            from:process.env.THISNODE,
                            error: err || undefined,
                            filename: originalFilename,
                            asset: asset,
                            md5: md5sum,
                            ip: ip,
                            version: version,
                            service:'Binary Repo'
                        });
                        return res.send({
                            error: err || undefined,
                            filename: originalFilename,
                            asset: asset,
                            md5: md5sum,
                            version: version
                        });
                    });
                });
            });
        });
    });
}

function fileInfoHeaders(req, res) {
    var asset = req.params.assetName;
    var version = req.params.versionName;
    // x-api-key header must be set
    var ip = req.headers['x-real-ip'];
    var key = req.headers['x-api-key'];
    var fileRequestHeader = req.headers['x-file-request'];
    if (!asset) return partails.fail(res, 'Asset name field empty');
    if (!key) return partails.fail(res, 'X-API-KEY not set', 401);
    if (!version) return partails.fail(res, 'Version name field empty');
    var group = 'group_dne';
    var params = {key: key};
    var url = '/auth/repo/' + asset;
    console.log('New get,', asset, version, key);
    partials.httpPost('authenticator', url, 80, params, function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        try {
            info = JSON.parse(data);
        } catch (e) {
            info = undefined;
            console.error('Parse error on:', data);
        }
        console.log('From team', info);
        if (!info || !info.team) return res.status(statusCode).send(data);
        group = info.team;
        var targetPath = path.join(
            conf.storageDir,
            group,
            asset,
            version
        );
        // Check if key contains whitelist
        if (info.key.readonly && info.key.whitelist) {
            var approved = info.key.whitelist.repo_adapter;
            if (!approved || approved.indexOf(asset) < 0) {
                return res.status(401).send({
                    error: 'Asset not in whitelist'
                });
            }
        }
        res.setHeader('X-AUTH-TEAM', group);
        res.setHeader('X-AUTH-ASSET', asset);
        res.setHeader('X-AUTH-VERSION', version);
        console.log('Translated to', targetPath);
        fs.readdir(targetPath, function(err, files) {
            if (err && err.code == 'ENOENT') return res.status(404).send({
                asset:asset,
                version:version,
                error: 'Asset/version not found on this server!'
            });
            if (err) return res.status(501).send(err);
            console.log('Checking', files, 'in', targetPath);
            // Do not index files that start with a "."
            var files = filterSystemFiles(files);
            console.log('Available files', files);
            if (files.length == 0) return res.status(404).end();
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
            sp({
                type:'download',
                from:process.env.THISNODE,
                asset: asset,
                ip: ip,
                version: version,
                service:'Binary Repo'
            });
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
    fs.readdir(targetPath, (err, versions)=>{
        var versions = versions.filter(version => {
            var vPath = path.join(targetPath, version);
            var files = filterSystemFiles(fs.readdirSync(vPath));
            return (files.length > 0);
        });
        callback(err, versions);
    });
}

function getImagesByTeam(team, callback) {
    var targetPath = path.join(conf.storageDir, team);
    var result = [];
    fs.readdir(targetPath, function(err, dir) {
        // team does not exist
        if (err && err.errno == -2) return callback(null, []);
        // other error
        if (err) return callback(err);
        for (var index in dir) {
            var asset = dir[index];
            (function(asset) {getVersions(team, asset, function(err, vers) {
                if (vers.length > 0)
                    result.push({name:asset, versions:vers});
                else
                    result.push({});
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

function spawn(cmd, txId, callback) {
    if (cmd === undefined) {
        console.error('Undefined command from', txId);
        return callback({sc:266});
    }
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(error);
        }
        if (!error) error = {code:0};
        db().insert({
            type:'transferUpdate',
            value:txId,
            time: Date.now(),
            update:fmt('(%s) finished', cmd),
            stdout: stdout,
            stderr: stderr,
            error: error
        }, (err, resp) => {
            if (err) console.error(err);
            console.log('Doc inserted', resp);
        });
        callback({stderr: stderr, stdout: stdout, sc: error.code, cmd: cmd});
    });
}

function waterfall_exec(statements, txId, callback) {
    var next = 0;
    var report = [];
    function caller(result) {
        if (result) {
            report.push(result);
            if (result.sc != 0) return callback(report, true);
        }

        next++;

        if (next >= statements.length) {
            callback(report);
        } else {
            spawn(statements[next], txId, caller);
        }
    }
    spawn(statements[next], txId, caller);
}

app.post('/meta', function(req, res) {
    var asset = req.body.asset;
    var version = req.body.version;
    var team = req.body.team;
    var targetPath = path.join(
        conf.storageDir,
        team,
        asset,
        version
    );
    fs.readdir(targetPath, function(err, files) {
        if (err) {
            return res.status(500).send({
                error:fmt('Cannot read %s:%s', asset, version)
            });
        }
        var filename = filterSystemFiles(files)[0];
        var fullPath = path.join(targetPath, filename);
        md5(fullPath, (err, sum) => {
            res.send({
                filename,
                asset,
                version,
                team,
                sum: 'md5:'+sum
            });
        });
    });
});

app.post('/transfer', function(req, res) {
    var valid = /(?![\.]{1,2}$)[a-zA-Z0-9\_\-\.\:]+/;
    var doc = req.body;
    var txId = doc._id;
    var key = doc.key;
    var team = doc.team;
    var asset = doc.asset;
    var version = doc.version;
    var fpath = fmt('/var/asset-data/%s/%s/%s', team, asset, version);
    var steps = [];
    if (!valid.test(team) ||!valid.test(asset) ||!valid.test(version)) {
        steps = ['echo Invalid characters in request >&2; exit 1'];
    } else if (doc.delete) {
        steps = [
            fmt('[ -d \'%s\' ]', fpath),
            fmt('rm -rf \'%s\'', fpath)
        ];
    } else {
        var target = doc.target;
        var files = fs.readdirSync(fpath);
        var filename = filterSystemFiles(files)[0];
        var fullpath = path.join(fpath, filename);
        steps = [
            fmt('upload_partial -k %s %s %s %s %s',
                key, target, fullpath, asset, version)
        ];
    }
    console.log('Step List', steps);
    waterfall_exec(steps, txId, function(report, failed) {
        db().insert({
            type:'transferUpdate',
            value:txId,
            time: Date.now(),
            update:'done',
            failed: failed
        }, (err, resp) => {
            if (err) console.error(err);
        });
    });
    res.status(200).send(doc);
});


/* for debug */
app.get('/auth', function(req, res) {
    var params = {key: 'abc'};
    var url = '/auth/repo/asset01';
    partials.httpPost('authenticator', url, 80, params, function(status, data) {
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

/* partials */
app.post('/assets/partial', partials.createNew);
app.post('/assets/partial/:txId/next', partials.next);
app.post('/assets/partial/:txId/collate', partials.collate);
app.post('/assets/partial/:txId/:sequence', partials.uploadPartial);

app.get('/list/:teamname?', listImages);

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
