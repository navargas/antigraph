var express = require('express');
var exec = require('child_process').exec;
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var db = require('./lib/db');
var images = require('./lib/images');
var fmt = require('util').format;
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.use('/capacity', require('./routes/capacity'));

var PORT = process.env.PORT || 80;

function spawn(cmd, txId, callback) {
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

        if (next == statements.length) {
            callback(report);
        } else {
            spawn(statements[next], txId, caller);
        }
    }
    spawn(statements[next], txId, caller);
}

app.post('/meta', function(req, res) {
    var image = req.body.asset;
    var tag = req.body.version;
    var team = req.body.team;
    var base = '/registry-data/docker/registry/v2/repositories/';
    var fullPath = path.join(
        base, team, image, '_manifests', 'tags', tag, 'current', 'link'
    );
    fs.readFile(fullPath, 'utf8', function(err, data) {
        if (err && err.code == 'ENOENT') return res.status(404).send({
            error: fmt('Tag %s:%s not found', image, tag)
        });
        if (err) {
            return res.status(500).send(err);
        }
        res.send({sum:data});
    });
});

app.post('/transfer', function(req, res) {
    var valid = /[a-zA-Z0-9\_\-\.]+/;
    var doc = req.body;
    var txId = doc._id;
    var key = doc.key;
    var team = doc.team;
    var asset = doc.asset;
    var version = doc.version;
    var target = doc.target;
    var source = 'registry:5000';
    var fqnOld = fmt('%s/%s:%s', source, asset, version);
    var fqnNew = fmt('%s/%s:%s', target, asset, version);
    var steps;
    if (!valid.test(target) || !valid.test(asset) || !valid.test(version)) {
        steps = ['echo Invalid characters in request >&2; exit 1'];
    } else if (doc.delete) {
        // Extract imagename from "teamname/imagename"
        var image = asset.split('/')[1];
        steps = [fmt('delete_image "%s" "%s" "%s"', team, image, version)];
    } else {
        steps = [
            fmt('docker pull %s', fqnOld),
            fmt('docker tag %s %s', fqnOld, fqnNew),
            fmt('docker login -u token -p %s -e none', key, target),
            fmt('docker push %s', fqnNew),
            fmt('docker rmi %s %s', fqnNew, fqnOld)
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

app.get('/list/:teamname?', function(req, res) {
    images.getImageVersions(req.params.teamname, (error, imgVers)=>{
        res.send({assets:imgVers, error:error});
    });
});

app.get('/accept', function(req, res) {
    res.status(201).send({auth:'ok'});
});
app.get('/reject', function(req, res) {
    res.status(401).send({auth:'no'});
});

/* start server */
app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
