var path = require('path')
var _ = require('lodash')

function startsWith(what, withWhat) {
    return what.substr(0, withWhat.length) === withWhat
}

module.exports = {
    CXX: '/usr/bin/c++',
    buildPath: path.resolve(process.env.BUILDDIR),
    srcRootPath: path.resolve(process.env.SRCDIR),
    ignoreSourceFilePath: function(filePath, srcRootPath, buildPath) {
        return startsWith(filePath, buildPath)
    },
    parseSourceFilePath: function(filePath, srcRootPath, buildPath)
    {
        var parts = filePath.split(path.sep)
        var n = parts.length - 5
        if (n < 0)
            throw new Error('Unable to parse source file name ' + filePath + ' - too few parts in path')
        return {
            repo: parts[n],
            module: parts[n+2],
            modulePath: parts.slice(0, n+3).join('/'),
            name: parts[n+4]
        }
    },
    parseHeaderFilePath: function(filePath, srcRootPath, buildPath)
    {
        var inSourcePath = startsWith(filePath, srcRootPath)
        var parts = filePath.split(path.sep)
        var info = {
            name: parts.slice(-1)[0]
        }
        if (inSourcePath) {
            var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
            if (n <= 0)
                return info
            _.extend(info, {
                repo: parts[n-1],
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        }
        return info
    }
}
