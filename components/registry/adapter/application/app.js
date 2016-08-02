var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var fmt = require('util').format;
var http = require('http');
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var PORT = process.env.PORT || 80;

function getTags(imageName, callback) {
    var buffer = '';
    var httpReq = {
        hostname: 'registry',
        port: 5000,
        method: 'GET',
        path: '/v2/'+imageName+'/tags/list'
    };
    var getreq = http.request(httpReq, function(getres) {
        getres.setEncoding('utf8');
        getres.on('data', function(chunk) {
            buffer += chunk;
        });
        getres.on('end', function() {
            var data;
            try {
                data = JSON.parse(buffer);
            } catch (e) {
                console.error(e);
            }
            if (callback) callback(data.tags);
        })
    });
    getreq.end();
}

function getTagInfo(images, callback) {
    if (images.length === 0) {
        if (callback) callback([]);
    }
    var result = [];
    for (var index in images) {
        var img = images[index];
        (function (img) {getTags(img, function(versions) {
            result.push({name:img, versions:versions});
            if (result.length == images.length) {
                if (callback) callback(result);
            }
        })})(img);
    }
}

app.get('/list/:teamname?', function(req, res) {
    var all = (req.params.teamname === undefined);
    var team = req.params.teamname + '/';
    var buffer = '';
    var httpReq = {
        hostname: 'registry',
        port: 5000,
        method: 'GET',
        path: '/v2/_catalog'
    };
    var getreq = http.request(httpReq, function(getres) {
        getres.setEncoding('utf8');
        getres.on('data', function(chunk) {
            buffer += chunk;
        });
        getres.on('end', function() {
            var imageList;
            var error;
            try {
                var list = JSON.parse(buffer).repositories;
                if (all) {
                    imageList = list;
                } else {
                    imageList = list.filter(
                        (i) => {return i.indexOf(team) == 0});
                }
            } catch(e) {
                console.error(e);
                error = e;
            }
            getTagInfo(imageList, function(imageVersions) {
                res.send({assets:imageVersions, error:error});
            });
        })
    });
    getreq.end();
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
