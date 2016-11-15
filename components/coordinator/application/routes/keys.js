var express = require('express');
var crypto = require('crypto');
var router = express.Router();
var db = require('../lib/db');
var auth = require('../lib/auth');
var names = require('../lib/names');

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
        if (rows.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        res.send(value.docs[0].whitelist);
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
    db().find(query, function(err, value) {
        if (err) return res.status(500).send(err);
        if (rows.length < 1) return res.status(404).send({
            error:'Key not found'
        });
        res.send(value.docs[0].whitelist[service]);
    });
});

router.post('/:keyname/whitelist/:service/:asset', (req, res) => {

});

module.exports = router;
