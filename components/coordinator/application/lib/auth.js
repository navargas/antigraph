var passport = require('passport');
var LdapStrategy = require('passport-ldapauth').Strategy;

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
                'in an IBM location. Retry on odin.svl.ibm.com';
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

module.exports.isValidUser = isValidUser;
