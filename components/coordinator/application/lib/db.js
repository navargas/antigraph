var cloudant;
var sp = require('simple-post')(process.env.EVENTS);
var DBNAME = 'antigraph';

var dbauth = {
    account: process.env.CLOUDANT_ACCOUNT,
    username: process.env.CLOUDANT_ACCOUNT,
    password: process.env.CLOUDANT_PASSWORD
}
console.log(dbauth);
function connect() {
    require('cloudant')(dbauth, function(err, dbcon) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        cloudant = dbcon;
        sp({
            type:'new_connection',
            error:err || undefined,
            from:process.env.THISNODE,
            to:dbauth.account
        });
    });
}

// establish connection
connect();
// reopen connection every 23 hours
setInterval(connect, 1000 * 60 * 60 * 23);

module.exports = function() {return cloudant.use(DBNAME);};
