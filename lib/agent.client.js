(function () {
    'use strict';

    var path = require('path'),
        fs = require('fs'),
        util = require('util');

    var $path = path.dirname(fs.realpathSync(__filename)),
        $a = {},
        $j = {};

    var options = {
        errorLevel: 2,
        exitLevel: 0,
        r: 5000, //Retry connection 5s
        u: 'https://guberni.slyip.com:3000/agent', //Url of the sockejs service
        k: '', //Client Key, if needed because ip validation
        cfgFile: '', //Config file to save agent data
        cfgPath: path.join($path, '../../ta_cfg'),
        logFile: '', //Log file
        logPath: path.join($path, '../../ta_log'),
        scriptPath: path.join($path, '../scripts'),
        t: 10000, //Command Timeout 10s
        v: '0.0.48', //Version
        tags: null,
        id: null
    }

    var api = {
        conf: {
            read: function (file, callBack) {
                var cfg = null;
                fs.readFile(file, 'utf8', function (err, data) {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            cfg = undefined;
                        } else {
                            api.log.console(err, 2);
                        }
                    }
                    else {
                        cfg = (data.length === 0) ? {} : JSON.parse(data);
                    }
                    callBack(cfg);
                });
            },
            write: function (file, data) {
                fs.writeFile(file, data, function (err) {
                    if (err) {
                        api.log.console(err, 2);
                    }
                });
            },
            unlink: function (file) {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                    api.log.console('Successfully deleted the configuration File. If you want restart the Agent again!', 1);
                }
            },
            validate: function (data) {
                if (data !== undefined) {
                    try {
                        if (data !== {})
                            return data.key !== undefined && data.uuid !== undefined;
                    }
                    catch (e) { }
                }
                return false;
            },
            file: function (p, id) {
                return path.join(p, 'agent.' + ((id !== null) ? id + '.' : '') + 'cfg');
            }
        },
        agent: {
            set: function (data) {
                $a = data;
            },
            info: function (properties, uuid, callBack) {
                var createAgent = function (state, uuid) {
                    var os = require('os');
                    function getIpAddress() {
                        var ifaces = os.networkInterfaces();
                        var addr = '';
                        for (var dev in ifaces) {
                            ifaces[dev].forEach(function (details) {
                                if (details.family == 'IPv4' && !details.internal) {
                                    if (addr !== '') {
                                        addr += ',';
                                    }
                                    addr += details.address;
                                }
                            });
                        }
                        return addr;
                    };
                    function paths() {
                        return { log: properties.logFile, scripts: properties.scriptPath, conf: properties.cfgFile };
                    }
                    function versions(v) {
                        process.versions.agent = v;
                        return process.versions;
                    }
                    return {
                        uuid: (state !== null) ? state.uuid : uuid,
                        host: os.hostname(),
                        label: properties.id,
                        key: (state !== null) ? state.key : properties.k,
                        ip: getIpAddress(),
                        tz: new Date().getTimezoneOffset(),
                        platform: process.platform,
                        os: os.type(),
                        arch: os.arch(),
                        v: versions(properties.v),
                        tags: (state !== null) ? state.tags : properties.tags,
                        op: (state !== null) ? 1 : (uuid !== null ? 1 : 0),
                        libraries: api.agent.libraries.installed(properties.scriptPath),
                        paths: paths(),
                        PID: process.pid,
                        url: properties.u
                    }
                };
                api.conf.read(properties.cfgFile, function (conf) {
                    if (api.conf.validate(conf)) {
                        api.log.console('Restoring the agent...');
                        callBack(JSON.stringify(createAgent(conf, null)));
                    } else {
                        api.log.console((uuid !== undefined ? 'Recovering' : 'Activating') + ' the new agent...');
                        callBack(JSON.stringify(createAgent(null, uuid !== undefined ? uuid : null)));
                    }
                });
            },
            libraries:
            {
                remove: function (path) {
                    var files = [];
                    if (fs.existsSync(path)) {
                        files = fs.readdirSync(path);
                        files.forEach(function (file, index) {
                            var curPath = path + "/" + file;
                            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                                api.agent.libraries.remove(curPath);
                            } else { // delete file
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(path);
                    }
                },
                install: function (installPath, setup, key, jobs, debug, callBack) {
                    //Download and install? a package
                    api.jobs.stopLib(jobs, setup.libraryId);
                    var _path = path.join(installPath + setup.path, setup.libraryId.toString());
                    if (setup.package !== undefined) {
                        var options = {
                            host: setup.package.host,
                            port: setup.package.port,
                            path: setup.package.path.replace('{key}', key)
                        };
                        var http = require('http'), AdmZip = require('adm-zip');
                        var startAt = new Date().getTime();
                        var req = http.get(options, function (res) {
                            var data = [], dataLen = 0;
                            res.on('data', function (chunk) {
                                data.push(chunk);
                                dataLen += chunk.length;
                            }).on('end', function () {
                                if (data.length === 0) {
                                    callBack(2, new Date().getTime() - startAt);
                                    return;
                                }
                                var buf = new Buffer(dataLen);
                                for (var i = 0, len = data.length, pos = 0; i < len; i++) {
                                    data[i].copy(buf, pos);
                                    pos += data[i].length;
                                }
                                try {
                                    if (fs.existsSync(_path))
                                        api.agent.libraries.remove(_path);
                                    var zip = new AdmZip(buf);
                                    zip.extractAllTo(installPath + setup.path, true);
                                    AdmZip = http = null;
                                    if (setup.install !== null) {
                                        //Execute the setup install cmd
                                        run.spawn(installPath + setup.path, {
                                            cmd: setup.install[0],
                                            args: setup.install.splice(1, setup.install.length - 1),
                                            private: {},
                                            timeout: setup.timeout,
                                            path: setup.libraryId.toString(),
                                            async: false
                                        },
                                        debug,
                                        function (resp, code, duration) {
                                            callBack(code, new Date().getTime() - startAt, setup.libraryId);
                                        });
                                    } else
                                        callBack(0, new Date().getTime() - startAt, setup.libraryId);
                                }
                                catch (e) {
                                    callBack(-1, new Date().getTime() - startAt, e.message);
                                }
                            });
                        });
                        req.on('error', function (e) {
                            api.log.console('==========ERROR==========', 2);
                            api.log.console('There was a problem setting up the agent: ' + e.message + '@' + options.host, 2);
                            callBack(-1, new Date().getTime() - startAt, e.message);
                        });
                    } else {
                        //Just install a package
                        if (setup.install !== null) {
                            if (fs.existsSync(_path))
                                api.agent.libraries.remove(_path);
                            fs.mkdirSync(_path);
                            run.spawn(installPath + setup.path, {
                                cmd: setup.install[0],
                                args: setup.install.splice(1, setup.install.length - 1),
                                timeout: setup.timeout,
                                path: setup.libraryId.toString(),
                                private: {},
                                async: false
                            },
                            debug,
                            function (resp, code, duration) {
                                callBack(code, new Date().getTime() - startAt, setup.libraryId);
                            });
                        }
                    }
                },
                uninstall: function (installPath, setup, key, jobs, debug, callBack) {
                    //Download and install? a package
                    api.jobs.stopLib(jobs, setup.libraryId);
                    console.log(JSON.stringify(setup));
                    var _path = path.join(installPath + setup.path, setup.libraryId.toString());
                    var startAt = new Date().getTime();
                    //Just uninstall a package
                    if (setup.uninstall !== null) {
                        run.spawn(installPath + setup.path, {
                            cmd: setup.uninstall[0],
                            args: setup.uninstall.splice(1, setup.uninstall.length - 1),
                            timeout: setup.timeout,
                            path: setup.libraryId.toString(),
                            private: {},
                            async: false
                        },
                        debug,
                        function (resp, code, duration) {
                            if (fs.existsSync(_path))
                                api.agent.libraries.remove(_path);
                            callBack(code, new Date().getTime() - startAt, setup.libraryId);
                        });
                    } else {
                        if (fs.existsSync(_path))
                            api.agent.libraries.remove(_path);
                        callBack(0, new Date().getTime() - startAt, setup.libraryId);
                    }
                },
                installed: function (dir) {
                    var _files = [];
                    var files = fs.readdirSync(dir);
                    for (var i in files) {
                        if (!files.hasOwnProperty(i)) continue;
                        var name = path.join(dir, files[i]);
                        if (fs.statSync(name).isDirectory()) {
                            _files.push({ id: files[i], ts: fs.statSync(name).mtime.getTime() });
                        }
                    }
                    return _files;
                }
            }
        },
        log: {
            console: function (msg, level) {
                //level: 0 - Info, 1 - Warning, 2 - Error
                if (level === undefined)
                    level = 0;
                var _msg = level + '>' + new Date().toISOString() + ':' + msg;
                if (options.errorLevel <= level) {
                    process.stdout.write(_msg + '\n');
                    if (options.logFile !== '') {
                        fs.appendFile(options.logFile, _msg + '\r\n', function (err) {
                            if (err)
                                process.stdout.write('2>' + err + '\n');
                        });
                    }
                }
            },
            file: function (p, id) {
                return path.join(p, 'agent.' + ((id !== null) ? id + '.' : '') + 'log');
            }
        },
        jobs:
            {
                //running jobs
                add: function (jobs, job) {
                    if (jobs === null)
                        jobs = {};
                    jobs[job.conf.opId] = job;
                },
                //remove jobs
                remove: function (jobs, job) {
                    delete jobs[job.conf.opId];
                },
                //stop jobs
                stop: function (jobs, job) {
                    if (jobs !== null && jobs[job.conf.opId] !== undefined) {
                        jobs[job.conf.opId].pid.kill('SIGKILL');
                        delete jobs[job.conf.opId];
                    }
                },
                //stoping lib
                stopLib: function (jobs, libraryId) {
                    if (jobs !== null) {
                        for (var j in jobs)
                            if (jobs[j].conf.libraryId === libraryId)
                                api.jobs.stop(jobs, jobs[j]);
                    }
                },
                //stop all
                stopConf: function (jobs, opId) {
                    jobs[opId].pid.kill('SIGKILL');
                    delete jobs[opId];
                },
                stopAll: function (jobs) {
                    for (var job in jobs) {
                        jobs[job].pid.kill('SIGKILL');
                    }
                    jobs = {};
                },
            }
    };

    var socket = {
        connect: function (url, callBack) {
            var sockJS = require('sockjs-client');
            var sock = sockJS.create(url);
            sock.on('connection', function () { // connection is established 
                api.log.console('Connected to Tellki\'s Controller!');
                api.agent.info(options, $a.uuid, function (agent) {
                    sock.write(agent);
                });
            });
            sock.on('data', function (msg) { // received some data 
                if (msg === null || msg === undefined) {
                    return;
                }
                try {
                    var json = (typeof msg === 'object') ? msg : JSON.parse(msg);
                    switch (json.op) {
                        case -3:
                            api.log.console('Not found: ' + json.resp, 2);
                            api.conf.unlink(options.cfgFile);
                            break;
                        case -2:
                            api.log.console('Invalid: ' + json.resp, 2);
                            break;
                        case -1:
                            api.log.console('Terminating: ' + json.resp, 2);
                            break;
                        case 1: //Connect
                            api.conf.write(options.cfgFile, JSON.stringify(json.resp));
                            api.agent.set(json.resp);
                            api.log.console('Done! Waiting for instructions...');
                            break;
                        case 3: //Execute Command
                        case 5: //Scheduler Command
                            api.log.console((json.op === 3 ? 'Command: ' : 'Scheduler: ') + msg);
                            var pid = run.spawn(options.scriptPath, json, options.errorLevel === 0, function (resp, code, duration) {
                                sock.write(socket.response(json, resp, code, duration, $a));
                                api.jobs.remove($j, { conf: json });
                            });
                            api.jobs.add($j, { conf: json, pid: pid });
                            break;
                        case 100: //Install Library Response
                            api.agent.libraries.install(options.scriptPath, json, $a.key, $j, options.errorLevel === 0, function (res, duration, msg) {
                                sock.write(socket.response(json, msg, res, duration, $a));
                            });
                            break;
                        case 102: //Get Installed Libraries
                            sock.write(socket.response(json, api.agent.libraries.installed(options.scriptPath), null, null, $a));
                            break;
                        case 104: //Remove Library
                            api.agent.libraries.uninstall(options.scriptPath, json, $a.key, $j, options.errorLevel === 0, function (res, duration, msg) {
                                sock.write(socket.response(json, msg, res, duration, $a));
                            });
                            break;
                        case 200: //Stop all running Jobs
                            (json.opId !== undefined) ? api.jobs.stopConf($j, json.opId) : api.jobs.stopAll($j);
                            sock.write(socket.response(json, 'STOPALL', 200, 0, $a));
                            break;
                        case 300: //Stats
                            sock.write(socket.response(json, {
                                Memory: util.inspect(process.memoryUsage()),
                                Uptime: process.uptime(),
                                Jobs: Object.keys($j).length,
                                PID: process.pid
                            }, 300, 0, $a));
                            break;
                        default:
                            sock.write(socket.response(json, 'INVALID', -4, 0, $a));
                            break;
                    }
                } catch (e) {
                    api.log.console('Something went wrong, unexpected error: ' + e, 2);
                }
            });
            sock.on('error', function (e) { // something went wrong 
                api.log.console('Lost the connection, retry in ' + options.r + 'ms...', 2); // + JSON.stringify(e), 2);
                api.jobs.stopAll($j);
                callBack();
            });
            sock.on('close', function () {
                api.log.console('The connection was closed!', 1);
                api.jobs.stopAll($j);
                process.exit(0);
            });
        },
        retry: function (url, retry) {
            api.log.console('Trying to reconnect...', 1);
            this.start(url, retry);
        },
        start: function (url, retry) {
            this.connect(url, function () {
                setTimeout(function () {
                    socket.retry(url, retry);
                }, retry);
            });
        },
        response: function (data, resp, code, duration, agent) {
            return JSON.stringify({
                opId: data.opId,
                op: data.op + 1,
                uuid: agent.uuid,
                resp: resp,
                code: code !== null ? code.toString() : null,
                ts: new Date().getTime(),
                duration: duration
            });
        }
    };

    var cp = require('child_process');
    var run = {
        spawn: function (scriptPath, cmd, debug, callBack) {
            var options = {
                cwd: path.resolve((cmd.path === undefined) ? scriptPath : path.join(scriptPath, cmd.path)),
                env: process.env,
                start: new Date().getTime(),
                duration: function () { return new Date().getTime() - options.start },
                resp: ''
            };
            if (cmd.cmd === undefined) {
                callBack('Invalid operation!', -4, options.duration());
                return;
            }
            if (cmd.private === undefined)
                cmd.private = [];
            //*************************************************************************************************
            var $cmd = cmd.cmd;
            if (cmd.args !== null && cmd.args !== undefined) {
                for (var i = 0; i < cmd.args.length; i++)
                    $cmd += ' "' + (cmd.args[i] !== null ? (cmd.private[i] !== undefined ? (cmd.args[i].length === 0 || cmd.args[i] === "\"\"" ? '' : cmd.private[i]) : cmd.args[i]) : '') + '"';
            }
            if (debug) {
                api.log.console('PATH:' + options.cwd);
                api.log.console('CMD:' + $cmd);
            }

            var child = cp.spawn(cmd.cmd, cmd.args, options);
            var timedout = false;

            child.stdout.on('data', function (buffer) {
                if (cmd.async)
                    callBack(buffer.toString('utf-8'), null, options.duration());
                else
                    options.resp += buffer.toString('utf-8');
            });
            child.stderr.on('data', function (buffer) {
                if (cmd.async)
                    callBack(buffer.toString('utf-8'), -2, options.duration());
                else
                    options.resp += buffer.toString('utf-8');
            });
            child.on('exit', function (code) {
                if (!timedout) {
                    code = (code === null ? -3 : code);
                    api.log.console('Process exited with code: ' + code + (cmd.libraryId !== undefined ? ' Library: ' + cmd.libraryId : ''));
                    callBack(options.resp, code, options.duration());
                    clearTimeout(kill);
                }
            });
            child.on('error', function (e) {
                api.log.console('Caught exception: ' + e.toString(), 2);
                e.cmd = $cmd;
                e.cwd = options.cwd;
                callBack(JSON.stringify(e), e.errno, options.duration());
                clearTimeout(kill);
            });

            var kill = setTimeout(function () {
                if (child !== undefined) {
                    child.kill('SIGKILL');
                    callBack('Called a timedout!', -1, options.duration());
                    timedout = true;
                }
            }, cmd.timeout);

            return child;
        }
    }
    // =============================================================================
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    //Check PATHS
    if (!fs.existsSync(options.cfgPath)) fs.mkdirSync(options.cfgPath);
    if (!fs.existsSync(options.logPath)) fs.mkdirSync(options.logPath);
    if (!fs.existsSync(options.scriptPath)) fs.mkdirSync(options.scriptPath);
    //Read the Key value if it's submited by param
    var invalid = false;
    if (process.argv.length > 2) {
        for (var i = 2; i < process.argv.length; i++) {
            switch (process.argv[i]) {
                case '-id':
                    options.id = process.argv[++i];
                    break;
                case '-key':
                    options.k = process.argv[++i];
                    break;
                case '-url':
                    options.u = process.argv[++i];
                    break;
                case '-tags':
                    options.tags = process.argv[++i];
                    break;
                case '-uuid':
                    if (process.argv[i + 1].length === 36)
                        $a.uuid = process.argv[++i];
                    break;
                case '-debug':
                    options.errorLevel = 0;
                    break;
                default:
                    invalid = true;
                    process.stdout.write('Invalid parameters: "' + process.argv[i] + '"\n');
                    break;
            }
        }
    }
    options.cfgFile = api.conf.file(options.cfgPath, options.id);
    if (process.argv.length === 2 && !invalid) {
        if (!fs.existsSync(options.cfgFile)) {
            invalid = true;
            process.stdout.write('Configuration file not found: "' + options.cfgFile + '". You need to reactive the agent again!\n');
        }
    }
    if (invalid) {
        process.stdout.write('Usage and parameters: tellki-agent -key {client_key}\n');
        process.stdout.write('[-id {agent_name}]\n');
        process.stdout.write('[-tags {tag1,tag2,tagN}]\n');
        process.stdout.write('[-uuid {agent_uuid}]\n');
        process.stdout.write('[-debug]\n');
        process.stdout.write('[-url {agent_url}]\n');
        process.exit(1);
    }
    // =============================================================================
    options.logFile = api.log.file(options.logPath, options.id);
    if (options.logFile !== '' && fs.existsSync(options.logFile))
        fs.unlinkSync(options.logFile);
    // =============================================================================
    api.log.console('PID: ' + process.pid);
    if (options.id !== null) api.log.console('Id: ' + options.id);
    api.log.console('Node version is ' + process.versions.node);
    api.log.console('Starting the Tellki Agent...');
    api.log.console('Platform is ' + process.platform);
    api.log.console('Agent path is ' + fs.realpathSync(__filename));
    api.log.console('Config file ' + options.cfgFile);
    api.log.console('Log file ' + options.logFile);
    api.log.console('Scripts path ' + options.scriptPath);
    // =============================================================================
    socket.start(options.u, options.r);
    // =============================================================================
    setInterval(function () {
        if (typeof global.gc === 'function') {
            global.gc();
            api.log.console('Cleared GC!');
        }
        api.log.console('Memory Usage: ' + util.inspect(process.memoryUsage()));
        api.log.console('Uptime: ' + process.uptime() + 's');
        api.log.console('Running Jobs: ' + Object.keys($j).length);
    }, 300000); //Each 5 minutes

}).call(this)