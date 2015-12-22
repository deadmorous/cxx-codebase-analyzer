var path = require('path')
var _ = require('lodash')

function startsWith(what, withWhat) {
    return what.substr(0, withWhat.length) === withWhat
}

module.exports = {
    CXX: '/usr/bin/c++',
    buildPath: path.resolve(process.env.BUILDDIR),
    srcRootPath: (function() {
        var result = path.resolve(process.env.SRCDIR)
        if (result.substr(-1) !== '/')
            result += '/'
        return result
    })(),
    ignoreSourceFilePath: function(filePath, srcRootPath, buildPath) {
        if (!startsWith(filePath, srcRootPath))
            // Ignore generated files
            return true
        var parts = filePath.split(path.sep)
        if (parts.length < 2)
            // Ignore paths consisting of just one part
            return true
        var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
        if (n < 0)
            // Ignore sources from non-modules
            return true
        if (n+3 !== parts.length)
            // Ignore sources nested deeper than expected (those are actually tests)
            return true
    },
    parseSourceFilePath: function(filePath, srcRootPath, buildPath) {
        var parts = filePath.split(path.sep)
        if (parts.length < 2)
            throw new Error('Unable to parse source file name ' + filePath + ' - too few parts in path')
        var info = {
            name: parts.slice(-1)[0]
        }
        var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
        if (n >= 0)
            _.extend(info, {
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        return info
    },
    parseHeaderFilePath: function(filePath, srcRootPath, buildPath)
    {
        var inSourcePath = startsWith(filePath, srcRootPath)
        var parts = filePath.split(/\\|\//)
        var info = {
            name: parts.slice(-1)[0]
        }
        if (inSourcePath) {
            var nx = _.findLastIndex(parts, function(part) {
                return part === 'external'
            })
            var n = _.findLastIndex(parts, function(part) {
                return part === 'modules'   ||   part === 'include'
            })
            if (n < 0 || (nx > 0 && nx < n))
                return info
            parts[n] = 'modules'
            _.extend(info, {
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        }
        return info
    }
}
