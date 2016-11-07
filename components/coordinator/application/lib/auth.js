var passport = require('passport');
var LdapStrategy = require('passport-ldapauth').Strategy;
var db = require('./db');

var LDAP_OPTS = {
    server: {
        url: 'ldap://bluepages.ibm.com:389',
        bindCredentials: '',
        searchBase: 'ou=bluepages,o=ibm.com',
        searchFilter: '(&(objectclass=ibmPerson)(mail={{username}}))',
        searchAttributes: ['mail', 'callupName']
    }
};
passport.use(new LdapStrategy(LDAP_OPTS));

function isValidUser(email, password, callback) {
    var TOErr = '(LDAP Timeout) This process will only work on a mirror ' +
                'in an IBM location. Retry on https://svl.cumulusrepo.com, ' +
                'or paste an API key under "Import Existing Key"';
    var invalidErr = 'Invalid username or password';
    var req = {body:{username:email, password:password}};
    var next = function() {};
    var respose = {unsent: true, callback:callback}; 
    if (email === 'navargas@us.ibm.com' &&
            password === process.env.LDAPFAIL) {
        return callback(true);
    }
    // This process will fail critically if the LDAP server cannot be
    // reached. Unfortunately, the err variable is not used correctly.
    passport.authenticate('ldapauth', function(err, user, info) {
        // User is not undefined
        console.log(user);
        var valid = !!(user);
        if (respose.unsent) {
            respose.callback(valid, invalidErr);
            respose.unsent = false;
        }
    })(req, {}, next);
    // As a result this timeout is required instead
    setTimeout(function() {
        if (respose.unsent) {
            respose.callback(false, TOErr);
            respose.unsent = false;
        }
    }, 1000 * 5);
}

var keyCache = {};
function getKeyDoc(key, callback) {
    var query = {
        "selector": {
            "_id": {"$gt": 0},
            "type": { "$eq":'key' },
            "value": { "$eq":key }
        }
    };
    var now = Date.now();
    var tenMin = 1000 * 60 * 10;
    if (keyCache[key] && keyCache[key].expire > now)
        return callback(null, keyCache[key].doc);
    console.log(query);
    db().find(query, function(err, value) {
        console.log('value', value);
        if (err)
            return callback(err);
        // if there are no rows return does_not_exist
        if (value.docs.length === 0)
            return callback({error:'key_does_not_exist'});
        keyCache[key] = {expire: Date.now() + tenMin, doc: value.docs[0]};
        callback(null, value.docs[0]);
    });
}

function invalidateKey(key) {
    keyCache[key] = undefined;
}

function verify(req, res, next) {
    var key = req.session.key ||
              req.headers['x-api-key'] ||
              req.cookies.apikey;
    getKeyDoc(key, function(err, keydoc) {
        if (err) return res.status(500).send(err);
        if (keydoc.readonly) {
            return res.status(500).send({error:'Readonly key used'});
        }
        req.keydoc = keydoc;
        next();
    });
}

module.exports.invalidateKey = invalidateKey;
module.exports.isValidUser = isValidUser;
module.exports.getKeyDoc = getKeyDoc;
module.exports.verify = verify;
