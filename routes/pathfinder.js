var _ = require('lodash')

function PathFinder() {
    this.data = {}
}
PathFinder.prototype.add = function(path, value) {
    var data = this.data
    var parts = path.split('/')
    var n = parts.length
    _.each(parts, function(part, ipart) {
        if (data.hasOwnProperty(part)) {
            data = data[part]
            if (ipart+1 === n   ||   data instanceof Function)
                throw new Error('PathFinder.add: Inconsistent set of paths')
        }
        else if (ipart+1 === n)
            data[part] = function() { return value }
        else
            data = data[part] = {}
    })
    return data instanceof Function? data() : undefined
}
PathFinder.prototype.addMany = function(values, toPath) {
    var self = this
    _.each(values, function(value, key) {
        self.add(toPath(value, key), value)
    })
}
PathFinder.prototype.find = function(path) {
    var data = this.data
    _.each(path.split('/'), function(part) {
        if (data)
            data = data[part]
    })
    return data instanceof Function? data() : undefined
}
PathFinder.prototype.findMatchingLeaf = function(path) {
    var data = this.data
    _.each(path.split('/'), function(part) {
        if (data && !(data instanceof Function))
            data = data[part]
    })
    return data instanceof Function? data() : undefined
}
PathFinder.prototype.basePath = function() {
    var data = this.data
    var pathItems = []
    while (data && !(data instanceof Function) && _.size(data) === 1)
        data = _.map(data, function(value, key) {
            pathItems.push(key)
            return value
        })[0]
    return pathItems.join('/')
}

module.exports = PathFinder
