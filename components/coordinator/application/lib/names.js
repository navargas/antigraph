

module.exports.getServices = function() {
    var services = [];
    if (process.env.SERVICES)
        services = process.env.SERVICES.split('+');
    var result = services.map((o) => o.split('/'));
    return result;
};

module.exports.getGeo = function() {
    var geo = [];
    if (process.env.GEO)
        geo = process.env.GEO.split('+');
    for (var ix in geo) {
        geo[ix] = geo[ix].split('/');
    }
    return geo;
};

/* valid matches include strings that share the same initial letters
   for example "Docker Registry" is matched by "Docker" and "docker"
   and "Binary Assets" is matched by "bin" and "binary" */
module.exports.translateService = function(display) {
    var nameMatch = RegExp(fmt('^%s.*', display), 'i');
    for (var ix in SERVICES) {
        var full = SERVICES[ix][1];
        if (nameMatch.test(full)) return SERVICES[ix][0];
    }
}

module.exports.translateGeo = function(display) {
    for (var ix in GEO) {
        if (GEO[ix][1] == display) return GEO[ix][0];
    }
}
