var path = require('path')
var projdep = require('./projdep.js')
var _ = require('lodash')

function startsWith(what, withWhat) {
    return what.substr(0, withWhat.length) === withWhat
}

var buildInfo = {
    options: require('./build_options.js')
}

function rescan()
{
    delete buildInfo.data
    projdep(buildInfo.options, function(err, data) {
        if (err)
            console.log(err)
        else
            buildInfo.data = data
    })
}

rescan()

module.exports = function(req, res, next)
{
    req.buildInfo = buildInfo
    if (req.path === '/rescan') {
        if (projdep.status().status !== 'ready')
            res.status(412).send('Build log scanning is already in progress')
        else {
            rescan()
            res.end()
        }
        return
    }
    next()
}
