/**
 * Configuration node.js pour exposer :
 * 	- La page Web et ses ressources
 *  - Le service WebSocket de suivi des logs
 * @author ZUBER Lionel <lionel.zuber@armaklan.org>
 * @version 0.1
 * @license MIT
 */

var express = require('express'),
	http = require('http'),
	path = require('path');
var fs = require('fs'); // file system module
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);

var tail = [];

var logModule = require('./conf.js');
var logfolders = logModule.logfolders;
var highlight = logModule.highlight;

highlight.forEach(function (h) {
	h.text = h.text.toLowerCase();
});

Tail = require('tail').Tail;

app.configure(function () {
	app.use(express.static(__dirname + '/app'));
	app.use(express.errorHandler({ dumpExceptions: true, showStack: false }));
});

server.listen(7000);

var walk = function (dir, parent) {
	var results = []
	var list = fs.readdirSync(dir)
	list.forEach(function (file) {
		var sub = path.join(parent, file)
		var subFolder = path.join(dir, file)
		var stat = fs.statSync(subFolder)

		var obj = {
			name: file,
			path: new Buffer(sub).toString('base64')
		}
		if (stat && stat.isDirectory()) {
			obj.children = walk(subFolder, sub)
		}
		results.push(obj)
	})
	return results
}

app.get('/folders', function (req, res) {
	res.send({
		folders: logfolders.map(function (f) {
			return {
				name: f.name,
				path: 'Lw==',
				children: walk(f.path, 'gongfuge')
			}
		}),
		success: true
	});
});

var getPath = function (relativePath) {
	if (relativePath) {
		relativePath = new Buffer(relativePath, 'base64').toString('ascii');
		for (var index = 0; index < logfolders.length; index++) {
			var folder = logfolders[index];
			if (relativePath.indexOf(folder.name) === 0) {
				var filename = path.join(folder.path, relativePath.replace(folder.name, ''))
				if (fs.existsSync(filename)) return filename;
			}
		}
	}
	return null;
};

var getCss = function (line) {
	var css = ""
	highlight.forEach(function (elt) {
		if ((css == "") && (line.toLowerCase().indexOf(elt.text) != -1)) {
			css = "alert alert-" + elt.level;
		}
	});
	return css;
}

io.of('/view').on('connection', function (client) {
	client.on('init', function (relativePath) {
		var filename = getPath(relativePath);
		if (filename === null) {
			client.emit('Log', {
				text: 'Cannot find file: ' + relativePath
			});
			return;
		}

		if (fs.lstatSync(filename).isDirectory()) {
			client.emit('Log', {
				text: 'Directory selected'
			})
			return;
		}

		if (!tail[filename]) {
			tail[filename] = new Tail(filename);
			tail[filename].on('error', function () {
				console.log("ERROR FATAL - File " + filename + " not found ");
				throw new Error("ERROR FATAL - File " + filename + " not found ");
			});
		}

		fs.readFile(filename, 'utf-8', function (err, data) {
			if (err) throw err;

			var lines = data.trim().split('\n');
			var lastLines = lines.slice(-300);

			lastLines.forEach(function (line) {
				var css = getCss(line);
				client.emit('Log', {
					'text': line,
					'css': css
				});
			});
		});

		tail[filename].on("line", function (data) {
			var css = getCss(line);
			client.emit('Log', {
				'text': line,
				'css': css
			});
		});
	});
});

app.get('/download/:path', function (req, res) {
	var filename = getPath(req.params.path);
	var stat = fs.statSync(filename);
	res.writeHead(200, {
		'Content-Type': 'application/octet-stream',
		'Content-Length': stat.size,
		'Content-disposition': 'attachment; filename="' + path.basename(filename) + '.log"'
	});
	var stream = fs.createReadStream(filename, { bufferSize: 64 * 1024 });
	stream.pipe(res);
});
