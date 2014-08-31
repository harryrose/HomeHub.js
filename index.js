var http = require('http');

var sessionCookieName = 'rg_cookie_session_id'; 


var currentSession = null; 

var getPageUrl = function(hostname,targetPage) {
	return 'http://'+hostname+'/index.cgi?active_page='+targetPage;
};

var getSessionIdFromResult = function(result) {
	var id = undefined;
	if(result.headers['set-cookie'] !== undefined) {
		for(var k = 0; id === undefined && k < result.headers['set-cookie'].length; k++) {
		var keyvalues = result.headers['set-cookie'][k].split('=');
			for(var i = 0; id === undefined && i+1 < keyvalues.length; i+=2) {
				if(keyvalues[i] == sessionCookieName) {
					var valuepaths = keyvalues[i+1].split(';');
					id = valuepaths[0];
				}
			}
		}
	}

	return id;
};

var getParsedDoc = function(str) {
	var dom = require('xmldom').DOMParser;

	return new dom({locator:{},
	    errorHandler:{
	    			warning: function() {},
	    		error: function(){},
	    		fatalError:function(){}
			}
	    }).parseFromString(str);
};

var getInputValue = function (body,name) {
	var xpath = require('xpath');
	var doc = getParsedDoc(body);
	var nodes = xpath.select1("//INPUT[@name='"+name+"']/@value",doc);

	if(nodes === undefined || nodes == null) {
		return undefined;
	} else {
		return nodes.value;
	}
};

var getAuthKey = function(body) { return getInputValue(body,'auth_key'); }
var getRequestId = function(body) { return getInputValue(body,'request_id'); }

var getRequest = function(targetHost,targetPage,session, callback) {
	return getRequestRaw(targetHost, '/index.cgi?active_page='+targetPage, session, callback);
};

var getRequestRaw = function(targetHost, url, session, callback) {
	var options = {
		hostname: targetHost,
		path: url,
		method: 'GET',
	};

	if(session !== undefined && session !== null) {
		if(typeof(session) != 'function') {
			options['headers'] = {
				'Cookie': sessionCookieName +'='+ session,
			};
		} else {
			callback = session;
		}
	}

	http.request(options, function (result) {
		var body = '';
		result.on('data',function(s) {
			body += s;
		});
		
		result.on('end',function() {
			callback(getSessionIdFromResult(result), body);
		});
	}).on('error',function(err) {
		console.log("Got an error... " );
	}).end();
};

var postLogin = function(targetHost,targetPage, passwordPlain, authKey, sessionId, requestId, callback) {
	var body =  require('querystring').stringify( {
		'request_id' : requestId,
		'active_page' : targetPage,
		'active_page_str' : 'bt_login',
		'mimic_button_field' : 'submit_button_login_submit: ..',
		'button_value':'',
		'post_id':0,
		'password_917510220':'',
		'md5_pass': require('MD5')( passwordPlain + authKey ),
		'auth_key': authKey
	});

	var url = getPageUrl(targetHost,targetPage);

	var options = {
		hostname: targetHost,
		path: '/index.cgi',
		method: 'POST',
		headers:  {
			'Cookie': sessionCookieName +'='+ sessionId,
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': Buffer.byteLength(body,'utf8')
		}
	};

	var req = http.request(options,function(result) {
		var body = '';

		result.on('data',function(data) {
			body += data;
		});

		result.on('end', function() {

			if(result.statusCode == 302) {
				//redirect
				getRequestRaw(targetHost,result.headers.location,sessionId, function (session,body) {
					callback(200, body);
				});
			} else {
				callback(result.statusCode, body); 
			}
		});
	});

	req.write(body);
	req.end();
};

var getTableValues = function (body, titles) {	
	var xpath = require('xpath');
	var doc = getParsedDoc(body);

	var result = {};

	for(var i = 0; i < titles.length; i++) {
		var queryString = "//TABLE//TD[text()='"+titles[i]+":']";
		var element = xpath.select1(queryString,doc);
		element = element.nextSibling;
		result[titles[i]] = element.firstChild.data;	
	}

	return result;

};

var getDataFromTableRows = function(targetHost, targetPage, password, tablerows, callback)
{
	console.log("Current Session: "+currentSession);

	getRequest(targetHost,targetPage, currentSession, function(session,body) {
		console.log("Got session: "+session);
		if(session != null) { // we've had a new session cookie...
			var authKey = getAuthKey(body);
			var requestKey = getRequestId(body);
			currentSession = session;
			postLogin(targetHost,targetPage, password, authKey, session, requestKey, function (status,body) {
				callback(getTableValues(body,tablerows));
			});
		} else {
			callback(getTableValues(body,tablerows));
		}
	});
}

exports.getDataFromTableRows = getDataFromTableRows;
