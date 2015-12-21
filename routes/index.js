var express = require('express')
var router = express.Router()
var buildDiagram = require('./builddiagram.js')
var projdep = require('./projdep.js')

/* GET home page. */
router
    .use(require('./buildinfo.js'))
    .get('/', function(req, res, next) {
        res.render('index', { req: req });
    })
    .get('/modules', function(req, res, next) {
        res.render('modules', { req: req });
    })
    .get('/diagram', buildDiagram)
    .get('/status', function(req, res, next) {
        res.send(projdep.status())
    })

module.exports = router;
