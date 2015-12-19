var express = require('express')
var router = express.Router()
var buildDiagram = require('./builddiagram.js')

/* GET home page. */
router
    .use(require('./buildinfo.js'))
    .get('/', function(req, res, next) {
        res.render('index', { req: req });
    })
    .get('/diagram', buildDiagram)

module.exports = router;
