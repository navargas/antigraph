var express = require('express');
var crypto = require('crypto');
var router = express.Router();
var db = require('../lib/db');
var auth = require('../lib/auth');
var names = require('../lib/names');

function translateServiceKeys(obj) {
    // Translate container name to display name
    var result = {};
    for (var key of Object.keys(obj)) {
        var newKey = names.translateService(key, true);
        result[newKey] = obj[key];
    }
    return result;
}

// Return a list of all named keys
router.get('/', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$ne':null }
        },
        'fields': ['name','description','value']
    };
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        res.send(value.docs);
    });
});

// Potentially deprecated
router.post('/modify/readonly', function(req, res) {
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

// Return information about a specific key
router.delete('/:keyname', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq': req.keydoc.team },
            'name': { '$eq': req.params.keyname }
        },
        'fields': ['_id', '_rev']
    };
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length == 0) return res.status(500).send({
            error:'Key does not exist',
            name:req.params.keyname
        });
        var key = value.docs[0];
        db().destroy(key._id, key._rev, function(err) {
            if (err) return res.status(500).send(err);
            return res.send({
                status:'success'
            });
        });
    });
});

// Return information about a specific key
router.put('/:keyname', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        },
        'fields': ['name','description','value', 'whitelist']
    };
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length > 0) return res.status(500).send({
            error:'Name must be unique',
            conflict:req.params.keyname,
            team:req.keydoc.team
        });
        var key = {
            type: 'key',
            name: req.params.keyname,
            value: crypto.randomBytes(16).toString('hex'),
            creator: req.keydoc.creator,
            created: Date.now(),
            valid: true,
            readonly: true,
            team: req.keydoc.team
        };
        db().insert(key, function(err) {
            if (err) return res.status(500).send(err);
            return res.send({
                status:'success',
                value:key.value,
                team: req.keydoc.team,
                name:req.params.keyname
            });
        });
    });
});

// Return information about a specific key
router.get('/:keyname', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        },
        'fields': ['name','description','value', 'whitelist']
    };
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        res.send(value.docs);
    });
});

// Return whitelist for a specific key
router.get('/:keyname/whitelist', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        },
        'fields': ['whitelist']
    };
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        res.send(translateServiceKeys(value.docs[0].whitelist));
    });
});

// Return whitelist for a specific key/service
router.get('/:keyname/whitelist/:service', auth.verify, function(req, res) {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        },
        'fields': ['whitelist']
    };
    var service = names.translateService(req.params.service);
    if (!service) return res.status(500).send({
        error:req.params.service + ' not recognized'
    });
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        res.send(value.docs[0].whitelist[service]);
    });
});

router.post('/:keyname/whitelist/:service/:asset', auth.verify, (req, res) => {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        }
    };
    var service = names.translateService(req.params.service);
    if (!service) return res.status(500).send({
        error:req.params.service + ' not recognized'
    });
    var asset = req.params.asset;
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        var doc = value.docs[0];
        if (!doc.whitelist)
            doc.whitelist = {};
        if (!doc.whitelist[service])
            doc.whitelist[service] = [];
        if (doc.whitelist[service].indexOf(asset) >= 0)
            return res.send({error:'This asset already exists in whitelist'});
        doc.whitelist[service].push(asset);
        db().insert(doc, doc._id, function(err, data) {
            if (err) {
                console.error('Issue updating key!', err);
                return res.status(501).send(err);
            }
            res.send(translateServiceKeys(doc.whitelist));
        });
    });
});

router.post('/:keyname/description', auth.verify, (req, res) => {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        }
    };
    var desc;
    var contentType = req.headers['content-type'];
    // If text/plain, read entire body
    // else, read description property
    if (contentType && contentType.toLowerCase() == 'text/plain')
        desc = req.body;
    else if (req.body && req.body.description)
        desc = req.body.description;
    // if undefined, return error
    if (!desc || typeof(desc) != 'string') return res.status(500).send({
        error: 'Description not set. Check Content-Type header'
    });
    if (desc.length > 500) return res.status(500).send({
        error: 'Description too long'
    });
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        var doc = value.docs[0];
        doc.description = desc;
        db().insert(doc, doc._id, function(err, data) {
            if (err) {
                console.error('Issue updating key!', err);
                return res.status(501).send(err);
            }
            res.send({description: desc});
        });
    });
});

router.delete('/:keyname/whitelist/:service/:asset', auth.verify, (req, res) => {
    var query = {
        'selector': {
            'type': { '$eq': 'key' },
            'team': { '$eq':req.keydoc.team },
            'name': { '$eq':req.params.keyname }
        }
    };
    var service = names.translateService(req.params.service);
    if (!service) return res.status(500).send({
        error:req.params.service + ' not recognized'
    });
    var asset = req.params.asset;
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (value.docs.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        var doc = value.docs[0];
        if (!doc.whitelist || !doc.whitelist[service])
            return res.status(500).send({error:'Asset not in whitelist'});
        var index = doc.whitelist[service].indexOf(asset);
        if (index < 0)
            return res.status(404).send({error:'Asset not in whitelist'});
        console.log('before', doc.whitelist[service]);
        doc.whitelist[service].splice(index, 1);
        console.log('after', doc.whitelist[service]);
        db().insert(doc, doc._id, function(err, data) {
            if (err) {
                console.error('Issue updating key!', err);
                return res.status(501).send(err);
            }
            res.send(translateServiceKeys(doc.whitelist));
        });
    });
});

module.exports = router;
