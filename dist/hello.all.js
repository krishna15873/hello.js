/**
 * @hello.js
 *
 * HelloJS is a client side Javascript SDK for making OAuth2 logins and subsequent REST calls.
 *
 * @author Andrew Dodson
 * @company Knarly
 *
 * @copyright Andrew Dodson, 2012 - 2013
 * @license MIT: You are free to use and modify this code for any use, on the condition that this copyright notice remains.
 */

// Can't use strict with arguments.callee
// "use strict";


//
// Setup
// Initiates the construction of the library

var hello = function(name){
	return hello.use(name);
};


hello.utils = {
	//
	// Extend the first object with the properties and methods of the second
	extend : function(a,b){
		for(var x in b){
			a[x] = b[x];
		}
	}
};



/////////////////////////////////////////////////
// Core library
// This contains the following methods
// ----------------------------------------------
// init
// login
// logout
// getAuthRequest
/////////////////////////////////////////////////

hello.utils.extend( hello, {

	//
	// Options
	settings : {

		//
		// OAuth 2 authentication defaults
		redirect_uri  : window.location.href.split('#')[0],
		response_type : 'token',
		display       : 'popup',
		state         : '',

		//
		// OAuth 1 shim
		// The path to the OAuth1 server for signing user requests
		// Wanna recreate your own? checkout https://github.com/MrSwitch/node-oauth-shim
		oauth_proxy   : 'https://auth-server.herokuapp.com/proxy',

		//
		// API Timeout, milliseconds
		timeout : 20000,

		//
		// Default Network
		default_service : null

	},


	//
	// Service
	// Get/Set the default service
	//
	service : function(service){

		//this.utils.warn("`hello.service` is deprecated");

		if(typeof (service) !== 'undefined' ){
			return this.utils.store( 'sync_service', service );
		}
		return this.utils.store( 'sync_service' );
	},


	//
	// Services
	// Collection of objects which define services configurations
	services : {},

	//
	// Use
	// Define a new instance of the Hello library with a default service
	use : function(service){
		// Create a new

		var F = function(){

			var settings = this.settings;

			// Reassign the settings
			this.settings = {
				default_service : service
			};

			// Delegate the other settings from the original settings object
			if(Object.setPrototypeOf){
				Object.setPrototypeOf(this.settings, settings);
			}
			else if(this.settings.__proto__){
				this.settings.__proto__ = settings;
			}
			else{
				// else can't extend its prototype, do the static thing
				for(var x in settings)if( settings.hasOwnProperty(x) && !( x in this.settings ) ){
					this.settings[x] = settings[x];
				}
			}
		}

		F.prototype = this;

		// Invoke as an instance
		var f = new F();

		// Create an instance of Events
		this.utils.Event.call(f);

		return f;
	},


	//
	// init
	// Define the clientId's for the endpoint services
	// @param object o, contains a key value pair, service => clientId
	// @param object opts, contains a key value pair of options used for defining the authentication defaults
	// @param number timeout, timeout in seconds
	//
	init : function(services,options){

		if(!services){
			return this.services;
		}

		// Define provider credentials
		// Reformat the ID field
		for( var x in services ){if(services.hasOwnProperty(x)){
			if( typeof(services[x]) !== 'object' ){
				services[x] = {id : services[x]};
			}
		}}

		//
		// merge services if there already exists some
		this.services = this.utils.merge(this.services, services);

		//
		// Format the incoming
		for( x in this.services ){if(this.services.hasOwnProperty(x)){
			this.services[x].scope = this.services[x].scope || {};
		}}

		//
		// Update the default settings with this one.
		if(options){
			this.settings = this.utils.merge(this.settings, options);

			// Do this immediatly incase the browser changes the current path.
			if("redirect_uri" in options){
				this.settings.redirect_uri = this.utils.realPath(options.redirect_uri);
			}
		}

		return this;
	},


	//
	// Login
	// Using the endpoint
	// @param network	stringify				name to connect to
	// @param options	object		(optional)	{display mode, is either none|popup(default)|page, scope: email,birthday,publish, .. }
	// @param callback	function	(optional)	fired on signin
	//
	login :  function(network, opts, callback){

		var p = this.utils.args({network:'s', options:'o', callback:'f'}, arguments);

		if(!(this instanceof arguments.callee)){
			// Invoke as an instance
			arguments.callee.prototype = this;
			return new arguments.callee(p);
		}

		// Create an instance of Events
		this.utils.Event.call(this);

		// Apply the args
		this.args = p;

		// Local vars
		var url, self = this;

		// merge/override options with app defaults
		p.options = this.utils.merge(this.settings, p.options || {} );

		// Network
		p.network = this.settings.default_service = p.network || this.settings.default_service;

		//
		// Bind listener
		this.on('complete', p.callback);

		// Is our service valid?
		if( typeof(p.network) !== 'string' || !( p.network in this.services ) ){
			// trigger the default login.
			// ahh we dont have one.
			self.emitAfter('error complete', {error:{
				code : 'invalid_network',
				message : 'The provided network was not recognized'
			}});
			return this;
		}

		//
		var provider  = this.services[p.network];

		//
		// Callback
		// Save the callback until state comes back.
		//
		var responded = false;

		//
		// Create a global listener to capture events triggered out of scope
		var callback_id = this.utils.globalEvent(function(obj){

			//
			// Cancel the popup close listener
			responded = true;

			//
			// Handle these response using the local
			// Trigger on the parent
			if(!obj.error){

				// Save on the parent window the new credentials
				// This fixes an IE10 bug i think... atleast it does for me.
				self.utils.store(obj.network,obj);

				// Trigger local complete events
				self.emit("complete success login auth.login auth", {
					network : obj.network,
					authResponse : obj
				});
			}
			else{
				// Trigger local complete events
				self.emit("complete error failed auth.failed", {
					error : obj.error
				});
			}
		});



		//
		// QUERY STRING
		// querystring parameters, we may pass our own arguments to form the querystring
		//
		p.qs = {
			client_id	: provider.id,
			response_type : p.options.response_type,
			redirect_uri : p.options.redirect_uri,
			display		: p.options.display,
			scope		: 'basic',
			state		: {
				client_id	: provider.id,
				network		: p.network,
				display		: p.options.display,
				callback	: callback_id,
				state		: p.options.state,
				oauth_proxy : p.options.oauth_proxy
			}
		};

		//
		// SCOPES
		// Authentication permisions
		//
		var scope = p.options.scope;
		if(scope){
			// Format
			if(typeof(scope)!=='string'){
				scope = scope.join(',');
			}
		}
		scope = (scope ? scope + ',' : '') + p.qs.scope;

		// Save in the State
		p.qs.state.scope = scope.split(/,\s/);

		// Map replace each scope with the providers default scopes
		p.qs.scope = scope.replace(/[^,\s]+/ig, function(m){
			return (m in provider.scope) ? provider.scope[m] : '';
		}).replace(/[,\s]+/ig, ',');

		// remove duplication and empty spaces
		p.qs.scope = this.utils.unique(p.qs.scope.split(/,+/)).join( provider.scope_delim || ',');


		//
		// Is the user already signed in
		//
		var session = this.getAuthResponse.call(hello, p.network);
		if( session && "access_token" in session && session.access_token && "expires" in session && session.expires > ((new Date()).getTime()/1e3) ){
			// What is different about the scopes in the session vs the scopes in the new login?
			var diff = this.utils.diff( session.scope || [], p.qs.state.scope || [] );
			if(diff.length===0){

				// Nothing has changed
				this.emit("notice", "User already has a valid access_token");

				// Ok trigger the callback
				this.emitAfter("complete success login", {
					network : p.network,
					authResponse : session
				});

				// Nothing has changed
				return this;
			}
		}

		//
		// REDIRECT_URI
		// Is the redirect_uri root?
		//
		p.qs.redirect_uri = this.utils.realPath(p.qs.redirect_uri);

		// Add OAuth to state
		if(provider.oauth){
			p.qs.state.oauth = provider.oauth;
		}

		// Convert state to a string
		p.qs.state = JSON.stringify(p.qs.state);


		// Bespoke
		// Override login querystrings from auth_options
		if("login" in provider && typeof(provider.login) === 'function'){
			// Format the paramaters according to the providers formatting function
			provider.login(p);
		}



		//
		// URL
		//
		if( provider.oauth && parseInt(provider.oauth.version,10) === 1 ){
			// Turn the request to the OAuth Proxy for 3-legged auth
			url = this.utils.qs( p.options.oauth_proxy, p.qs );
		}
		else{
			url = this.utils.qs( provider.uri.auth, p.qs );
		}

		this.emit("notice", "Authorization URL " + url );


		//
		// Execute
		// Trigger how we want this displayed
		// Calling Quietly?
		//
		if( p.options.display === 'none' ){
			// signin in the background, iframe
			this.utils.append('iframe', { src : url, style : {position:'absolute',left:"-1000px",bottom:0,height:'1px',width:'1px'} }, 'body');
		}


		// Triggering popup?
		else if( p.options.display === 'popup'){

			var windowHeight = p.options.window_height || 550;
			var windowWidth = p.options.window_width || 500;
			// Trigger callback
			var popup = window.open(
				url,
				'Authentication',
				"resizeable=true,height=" + windowHeight + ",width=" + windowWidth + ",left="+((window.innerWidth-windowWidth)/2)+",top="+((window.innerHeight-windowHeight)/2)
			);

			// Ensure popup window has focus upon reload, Fix for FF.
			popup.focus();

			var timer = setInterval(function(){
				if(popup.closed){
					clearInterval(timer);
					if(!responded){
						self.emit("complete failed error", {error:{code:"cancelled", message:"Login has been cancelled"}, network:p.network });
					}
				}
			}, 100);
		}

		else {
			window.location = url;
		}

		return this;
	},


	//
	// Logout
	// Remove any data associated with a given service
	// @param string name of the service
	// @param function callback
	//
	logout : function(s, callback){

		var p = this.utils.args({name:'s', callback:"f" }, arguments);

		if(!(this instanceof arguments.callee)){
			// Invoke as an instance
			arguments.callee.prototype = this;
			return new arguments.callee(p);
		}

		// Create an instance of Events
		this.utils.Event.call(this);

		var self = this;

		// Add callback to events
		this.on('complete', p.callback);

		// Netowrk
		p.name = p.name || this.settings.default_service;

		if( p.name && !( p.name in this.services ) ){
			this.emitAfter("complete error", {error:{
				code : 'invalid_network',
				message : 'The network was unrecognized'
			}});
			return this;
		}
		if(p.name && this.utils.store(p.name)){

			// Trigger a logout callback on the provider
			if(typeof(this.services[p.name].logout) === 'function'){
				this.services[p.name].logout(p);
			}

			// Remove from the store
			this.utils.store(p.name,'');
		}
		else if(!p.name){
			for(var x in this.utils.services){if(this.utils.services.hasOwnProperty(x)){
				this.logout(x);
			}}
			// remove the default
			this.service(false);
			// trigger callback
		}
		else{
			this.emitAfter("complete error", {error:{
				code : 'invalid_session',
				message : 'There was no session to remove'
			}});
			return this;
		}

		// Emit events by default
		this.emitAfter("complete logout success auth.logout auth", true);

		return this;
	},



	//
	// getAuthResponse
	// Returns all the sessions that are subscribed too
	// @param string optional, name of the service to get information about.
	//
	getAuthResponse : function(service){

		if(!(this instanceof arguments.callee)){
			// Invoke as an instance
			arguments.callee.prototype = this;
			return new arguments.callee(service);
		}

		// Create an instance of Events
		this.utils.Event.call(this);

		// If the service doesn't exist
		service = service || this.settings.default_service;

		if( !service || !( service in this.services ) ){
			this.emit("complete error", {error:{
				code : 'invalid_network',
				message : 'The network was unrecognized'
			}});
			return null;
		}


		return this.utils.store(service);
	},


	//
	// Events
	// Define placeholder for the events
	events : {}
});







///////////////////////////////////
// Core Utilities
///////////////////////////////////

hello.utils.extend( hello.utils, {

	// Append the querystring to a url
	// @param string url
	// @param object parameters
	qs : function(url, params){
		if(params){
			var reg;
			for(var x in params){
				if(url.indexOf(x)>-1){
					var str = "[\\?\\&]"+x+"=[^\\&]*";
					reg = new RegExp(str);
					url = url.replace(reg,'');
				}
			}
		}
		return url + (!this.isEmpty(params) ? ( url.indexOf('?') > -1 ? "&" : "?" ) + this.param(params) : '');
	},
	

	//
	// Param
	// Explode/Encode the parameters of an URL string/object
	// @param string s, String to decode
	//
	param : function(s){
		var b,
			a = {},
			m;
		
		if(typeof(s)==='string'){

			m = s.replace(/^[\#\?]/,'').match(/([^=\/\&]+)=([^\&]+)/g);
			if(m){
				for(var i=0;i<m.length;i++){
					b = m[i].split('=');
					a[b[0]] = decodeURIComponent( b[1] );
				}
			}
			return a;
		}
		else {
			var o = s;
		
			a = [];

			for( var x in o ){if(o.hasOwnProperty(x)){
				if( o.hasOwnProperty(x) ){
					a.push( [x, o[x] === '?' ? '?' : encodeURIComponent(o[x]) ].join('=') );
				}
			}}

			return a.join('&');
		}
	},
	

	//
	// Local Storage Facade
	store : function (name,value,days) {

		// Local storage
		var json = JSON.parse(localStorage.getItem('hello')) || {};

		if(name && typeof(value) === 'undefined'){
			return json[name];
		}
		else if(name && value === ''){
			try{
				delete json[name];
			}
			catch(e){
				json[name]=null;
			}
		}
		else if(name){
			json[name] = value;
		}
		else {
			return json;
		}

		localStorage.setItem('hello', JSON.stringify(json));

		return json;
	},


	//
	// Create and Append new Dom elements
	// @param node string
	// @param attr object literal
	// @param dom/string
	//
	append : function(node,attr,target){

		var n = typeof(node)==='string' ? document.createElement(node) : node;

		if(typeof(attr)==='object' ){
			if( "tagName" in attr ){
				target = attr;
			}
			else{
				for(var x in attr){if(attr.hasOwnProperty(x)){
					if(typeof(attr[x])==='object'){
						for(var y in attr[x]){if(attr[x].hasOwnProperty(y)){
							n[x][y] = attr[x][y];
						}}
					}
					else if(x==="html"){
						n.innerHTML = attr[x];
					}
					// IE doesn't like us setting methods with setAttribute
					else if(!/^on/.test(x)){
						n.setAttribute( x, attr[x]);
					}
					else{
						n[x] = attr[x];
					}
				}}
			}
		}
		
		if(target==='body'){
			(function self(){
				if(document.body){
					document.body.appendChild(n);
				}
				else{
					setTimeout( self, 16 );
				}
			})();
		}
		else if(typeof(target)==='object'){
			target.appendChild(n);
		}
		else if(typeof(target)==='string'){
			document.getElementsByTagName(target)[0].appendChild(n);
		}
		return n;
	},

	//
	// merge
	// recursive merge two objects into one, second parameter overides the first
	// @param a array
	//
	merge : function(a,b){
		var x,r = {};
		if( typeof(a) === 'object' && typeof(b) === 'object' ){
			for(x in a){if(a.hasOwnProperty(x)){
				r[x] = a[x];
				if(x in b){
					r[x] = this.merge( a[x], b[x]);
				}
			}}
			for(x in b){if(b.hasOwnProperty(x)){
				if(!(x in a)){
					r[x] = b[x];
				}
			}}
		}
		else{
			r = b;
		}
		return r;
	},

	//
	// Args utility
	// Makes it easier to assign parameters, where some are optional
	// @param o object
	// @param a arguments
	//
	args : function(o,args){

		var p = {},
			i = 0,
			t = null,
			x = null;
		
		// define x
		for(x in o){if(o.hasOwnProperty(x)){
			break;
		}}

		// Passing in hash object of arguments?
		// Where the first argument can't be an object
		if((args.length===1)&&(typeof(args[0])==='object')&&o[x]!='o!'){
			// return same hash.
			return args[0];
		}

		// else loop through and account for the missing ones.
		for(x in o){if(o.hasOwnProperty(x)){

			t = typeof( args[i] );

			if( ( typeof( o[x] ) === 'function' && o[x].test(args[i]) ) || ( typeof( o[x] ) === 'string' && (
					( o[x].indexOf('s')>-1 && t === 'string' ) ||
					( o[x].indexOf('o')>-1 && t === 'object' ) ||
					( o[x].indexOf('i')>-1 && t === 'number' ) ||
					( o[x].indexOf('a')>-1 && t === 'object' ) ||
					( o[x].indexOf('f')>-1 && t === 'function' )
				) )
			){
				p[x] = args[i++];
			}
			
			else if( typeof( o[x] ) === 'string' && o[x].indexOf('!')>-1 ){
				// ("Whoops! " + x + " not defined");
				return false;
			}
		}}
		return p;
	},

	//
	// realPath
	// Converts relative URL's to fully qualified URL's
	realPath : function(path){
		if( path.indexOf('/') === 0 ){
			path = window.location.protocol + '//' + window.location.host + path;
		}
		// Is the redirect_uri relative?
		else if( !path.match(/^https?\:\/\//) ){
			path = (window.location.href.replace(/#.*/,'').replace(/\/[^\/]+$/,'/') + path).replace(/\/\.\//g,'/');
		}
		while( /\/[^\/]+\/\.\.\//g.test(path) ){
			path = path.replace(/\/[^\/]+\/\.\.\//g, '/');
		}
		return path;
	},

	//
	// diff
	diff : function(a,b){
		var r = [];
		for(var i=0;i<b.length;i++){
			if(this.indexOf(a,b[i])===-1){
				r.push(b[i]);
			}
		}
		return r;
	},

	//
	// indexOf
	// IE hack Array.indexOf doesn't exist prior to IE9
	indexOf : function(a,s){
		// Do we need the hack?
		if(a.indexOf){
			return a.indexOf(s);
		}

		for(var j=0;j<a.length;j++){
			if(a[j]===s){
				return j;
			}
		}
		return -1;
	},


	//
	// unique
	// remove duplicate and null values from an array
	// @param a array
	//
	unique : function(a){
		if(typeof(a)!=='object'){ return []; }
		var r = [];
		for(var i=0;i<a.length;i++){

			if(!a[i]||a[i].length===0||this.indexOf(r, a[i])!==-1){
				continue;
			}
			else{
				r.push(a[i]);
			}
		}
		return r;
	},


	//
	// Log
	// [@param,..]
	//
	log : function(){

		if(typeof arguments[0] === 'string'){
			arguments[0] = "HelloJS-" + arguments[0];
		}
		if (typeof(console) === 'undefined'||typeof(console.log) === 'undefined'){ return; }
		if (typeof console.log === 'function') {
			console.log.apply(console, arguments); // FF, CHROME, Webkit
		}
		else{
			console.log(Array.prototype.slice.call(arguments)); // IE
		}
	},

	// isEmpty
	isEmpty : function (obj){
		// scalar?
		if(!obj){
			return true;
		}

		// Array?
		if(obj && obj.length>0) return false;
		if(obj && obj.length===0) return true;

		// object?
		for (var key in obj) {
			if (obj.hasOwnProperty(key)){
				return false;
			}
		}
		return true;
	},

	getPrototypeOf : function(obj){
		if(Object.getPrototypeOf){
			return Object.getPrototypeOf(obj);
		}
		else if(obj.__proto__){
			return obj.__proto__;
		}
		else if(obj.prototype && obj !== obj.prototype.constructor){
			return obj.prototype.constructor;
		}
	},

	//
	// Event
	// A contructor superclass for adding event menthods, on, off, emit.
	//
	Event : function(){

		// If this doesn't support getProtoType then we can't get prototype.events of the parent
		// So lets get the current instance events, and add those to a parent property
		this.parent = {
			events : this.events,
			findEvents : this.findEvents,
			parent : this.parent,
			utils : this.utils
		};

		this.events = {};

		//
		// On, Subscribe to events
		// @param evt		string
		// @param callback	function
		//
		this.on = function(evt, callback){

			if(callback&&typeof(callback)==='function'){
				var a = evt.split(/[\s\,]+/);
				for(var i=0;i<a.length;i++){

					// Has this event already been fired on this instance?
					this.events[a[i]] = [callback].concat(this.events[a[i]]||[]);
				}
			}

			return this;
		},


		//
		// Off, Unsubscribe to events
		// @param evt		string
		// @param callback	function
		//
		this.off = function(evt, callback){

			this.findEvents(evt, function(name, index){
				if(!callback || this.events[name][index] === callback){
					this.events[name].splice(index,1);
				}
			});

			return this;
		},
		
		//
		// Emit
		// Triggers any subscribed events
		//
		this.emit =function(evt, data){

			// Get arguments as an Array, knock off the first one
			var args = Array.prototype.slice.call(arguments, 1);
			args.push(evt);

			// Find the callbacks which match the condition and call
			var proto = this;
			while( proto && proto.findEvents ){
				proto.findEvents(evt, function(name, index){
					// Replace the last property with the event name
					args[args.length-1] = name;

					// Trigger
					this.events[name][index].apply(this, args);
				});

				// proto = this.utils.getPrototypeOf(proto);
				proto = proto.parent;
			}

			return this;
		};

		//
		// Easy functions
		this.emitAfter = function(){
			var self = this,
				args = arguments;
			setTimeout(function(){
				self.emit.apply(self, args);
			},0);
			return this;
		};
		this.success = function(callback){
			return this.on("success",callback);
		};
		this.error = function(callback){
			return this.on("error",callback);
		};
		this.complete = function(callback){
			return this.on("complete",callback);
		};


		this.findEvents = function(evt, callback){

			var a = evt.split(/[\s\,]+/);

			for(var name in this.events){if(this.events.hasOwnProperty(name)){
				if( this.utils.indexOf(a,name) > -1 ){
					for(var i=0;i<this.events[name].length;i++){
						// Emit on the local instance of this
						callback.call(this, name, i);
					}
				}
			}}
		};
	},


	//
	// Global Events
	// Attach the callback to the window object
	// Return its unique reference
	globalEvent : function(callback){
		var guid = "_hellojs_"+parseInt(Math.random()*1e12,10).toString(36);
		window[guid] = function(){
			// Trigger the callback
			var bool = callback.apply(this, arguments);

			if(bool){
				// Remove this handler reference
				try{
					delete window[guid];
				}catch(e){}
			}
		};
		return guid;
	}

});



//////////////////////////////////
// Events
//////////////////////////////////

// Extend the hello object with its own event instance
hello.utils.Event.call(hello);


// Shimming old deprecated functions
hello.subscribe = hello.on;
hello.trigger = hello.emit;
hello.unsubscribe = hello.off;




///////////////////////////////////
// Monitoring session state
// Check for session changes
///////////////////////////////////

(function(hello){

	// Monitor for a change in state and fire
	var old_session = {}, pending = {};


	(function self(){

		var CURRENT_TIME = ((new Date()).getTime()/1e3);

		// Loop through the services
		for(var name in hello.services){if(hello.services.hasOwnProperty(name)){

			if(!hello.services[name].id){
				// we haven't attached an ID so dont listen.
				continue;
			}
		
			// Get session
			var session = hello.utils.store(name) || {};
			var provider = hello.services[name];
			var oldsess = old_session[name] || {};
			var evt = '';

			//
			// Listen for globalEvents that did not get triggered from the child
			//
			if(session && "callback" in session){

				// to do remove from session object...
				var cb = session.callback;
				try{
					delete session.callback;
				}catch(e){}

				// Update store
				// Removing the callback
				hello.utils.store(name,session);

				// Emit global events
				try{
					window[cb](session);
				}
				catch(e){}
			}
			
			//
			// Refresh login
			//
			if( session && ("expires" in session) && session.expires < CURRENT_TIME ){

				// Refresh
				var refresh = ("autorefresh" in provider) ? provider.autorefresh : true;

				// Does this provider support refresh
				if( refresh && (!( name in pending ) || pending[name] < CURRENT_TIME) ) {
					// try to resignin
					hello.emit("notice", name + " has expired trying to resignin" );
					hello.login(name,{display:'none'});

					// update pending, every 10 minutes
					pending[name] = CURRENT_TIME + 600;
				}
				// If session has expired then we dont want to store its value until it can be established that its been updated
				continue;
			}
			// Has session changed?
			else if( oldsess.access_token === session.access_token &&
						oldsess.expires === session.expires ){
				continue;
			}
			// Access_token has been removed
			else if( !session.access_token && oldsess.access_token ){
				hello.emit('auth.logout', {
					network: name,
					authResponse : session
				});
			}
			// Access_token has been created
			else if( session.access_token && !oldsess.access_token ){
				hello.emit('auth.login', {
					network: name,
					authResponse: session
				} );
			}
			// Access_token has been updated
			else if( session.expires !== oldsess.expires ){
				hello.emit('auth.update', {
					network: name,
					authResponse: session
				} );
			}
			
			old_session[name] = session;
		}}

		// Check error events
		setTimeout(self, 1000);
	})();

})(hello);








/////////////////////////////////////
//
// Save any access token that is in the current page URL
//
/////////////////////////////////////

(function(hello){

	//
	// AuthCallback
	// Trigger a callback to authenticate
	//
	function authCallback(network, obj){

		// Trigger the callback on the parent
		hello.utils.store(obj.network, obj );

		// this is a popup so
		if( !("display" in p) || p.display !== 'page'){

			// trigger window.opener
			var win = (window.opener||window.parent);

			if(win){
				// Call the generic listeners
//				win.hello.emit(network+":auth."+(obj.error?'failed':'login'), obj);
				// Call the inline listeners

				// to do remove from session object...
				var cb = obj.callback;
				try{
					delete obj.callback;
				}catch(e){}

				// Call the globalEvent function on the parent
				win[cb](obj);

				// Update store
				hello.utils.store(obj.network,obj);
			}

			window.close();
			hello.emit("notice",'Trying to close window');

			// Dont execute any more
			return;
		}
	}

	//
	// Save session, from redirected authentication
	// #access_token has come in?
	//
	// FACEBOOK is returning auth errors within as a query_string... thats a stickler for consistency.
	// SoundCloud is the state in the querystring and the token in the hashtag, so we'll mix the two together
	var p = hello.utils.merge(hello.utils.param(window.location.search||''), hello.utils.param(window.location.hash||''));

	
	// if p.state
	if( p && "state" in p ){

		// remove any addition information
		// e.g. p.state = 'facebook.page';
		try{
			var a = JSON.parse(p.state);
			p = hello.utils.merge(p, a);
		}catch(e){
			hello.emit("error", "Could not decode state parameter");
		}

		// access_token?
		if( ("access_token" in p&&p.access_token) && p.network ){

			if(!p.expires_in || parseInt(p.expires_in,10) === 0){
				// If p.expires_in is unset, 1 hour, otherwise 0 = infinite, aka a month
				p.expires_in = !p.expires_id ? 3600 : (3600 * 24 * 30);
			}
			p.expires_in = parseInt(p.expires_in,10);
			p.expires = ((new Date()).getTime()/1e3) + parseInt(p.expires_in,10);

			// Make this the default users service
			hello.service( p.network );

			// Lets use the "state" to assign it to one of our networks
			authCallback( p.network, p );
		}

		//error=?
		//&error_description=?
		//&state=?
		else if( ("error" in p && p.error) && p.network ){
			// Error object
			p.error = {
				code: p.error,
				message : p.error_message || p.error_description
			};

			// Let the state handler handle it.
			authCallback( p.network, p );
		}

		// API Calls
		// IFRAME HACK
		// Result is serialized JSON string.
		if(p&&p.callback&&"result" in p && p.result ){
			// trigger a function in the parent
			if(p.callback in window.parent){
				window.parent[p.callback](JSON.parse(p.result));
			}
		}
	}

	// redefine
	p = hello.utils.param(window.location.search);

	// IS THIS AN OAUTH2 SERVER RESPONSE? OR AN OAUTH1 SERVER RESPONSE?
	if((p.code&&p.state) || (p.oauth_token&&p.proxy_url)){
		// Add this path as the redirect_uri
		p.redirect_uri = window.location.href.replace(/[\?\#].*$/,'');
		// JSON decode
		var state = JSON.parse(p.state);
		// redirect to the host
		var path = (state.oauth_proxy || p.proxy_url) + "?" + hello.utils.param(p);

		window.location = path;
	}

})(hello);



// EOF CORE lib
//////////////////////////////////







/////////////////////////////////////////
// API
// @param path		string
// @param method	string (optional)
// @param data		object (optional)
// @param timeout	integer (optional)
// @param callback	function (optional)

hello.api = function(){

	// get arguments
	var p = this.utils.args({path:'s!', method : "s", data:'o', timeout:'i', callback:"f" }, arguments);

	if(!(this instanceof arguments.callee)){
		// Invoke as an instance
		arguments.callee.prototype = this;
		return new arguments.callee(p);
	}

	// Create an instance of Events
	this.utils.Event.call(this);

	// Reference arguments
	this.args = p;

	// Reference instance
	var self = this;

	// method
	p.method = (p.method || 'get').toLowerCase();
	
	// data
	p.data = p.data || {};

	// Extrapolate the data from a form element
	this.utils.dataToJSON(p);

	// Path
	p.path = p.path.replace(/^\/+/,'');
	var a = (p.path.split(/[\/\:]/,2)||[])[0].toLowerCase();

	if(a in this.services){
		p.network = a;
		var reg = new RegExp('^'+a+':?\/?');
		p.path = p.path.replace(reg,'');
	}

	// Network
	p.network = this.settings.default_service = p.network || this.settings.default_service;

	// callback
	this.on('complete', p.callback);
	
	// timeout global setting
	if(p.timeout){
		this.settings.timeout = p.timeout;
	}

	// Log this request
	this.emit("notice", "API request "+p.method.toUpperCase()+" '"+p.path+"' (request)",p);
	
	var o = this.services[p.network];
	
	// Have we got a service
	if(!o){
		self.emitAfter("complete error", {error:{
			code : "invalid_network",
			message : "Could not match the service requested: " + p.network
		}});
		return this;
	}

	//
	// Callback wrapper?
	// Change the incoming values so that they are have generic values according to the path that is defined
	var callback = function(r,code){
		if( o.wrap && ( (p.path in o.wrap) || ("default" in o.wrap) )){
			var wrap = (p.path in o.wrap ? p.path : "default");
			var time = (new Date()).getTime();
			r = o.wrap[wrap](r,code);
			self.emit("notice", "Processing took" + ((new Date()).getTime() - time));
		}
		self.emit("notice", "API: "+p.method.toUpperCase()+" '"+p.path+"' (response)", r);

		// Emit the correct event
		self.emit("complete " + (!r || "error" in r ? 'error' : 'success'), r, code);
	};

	// push out to all networks
	// as long as the path isn't flagged as unavaiable, e.g. path == false
	if( !(p.path in o.uri) || o.uri[p.path] !== false ){

		var url = (p.path in o.uri ?
					o.uri[p.path] :
					( o.uri['default'] ? o.uri['default'] : p.path));

		// if url needs a base
		// Wrap everything in
		var getPath = function(url){

			if( !url.match(/^https?:\/\//) ){
				url = o.uri.base + url;
			}


			var qs = {};

			// Format URL
			var format_url = function( qs_handler, callback ){

				// Execute the qs_handler for any additional parameters
				if(qs_handler){
					if(typeof(qs_handler)==='function'){
						qs_handler(qs);
					}
					else{
						qs = self.utils.merge(qs, qs_handler);
					}
				}

				var path = self.utils.qs(url, qs||{} );

				self.emit("notice", "Request " + path);

				_sign(p.network, path, p.method, p.data, o.querystring, callback);
			};


			// Update the resource_uri
			//url += ( url.indexOf('?') > -1 ? "&" : "?" );

			// Format the data
			if( !self.utils.isEmpty(p.data) && !self.utils.dataToJSON(p) ){
				// If we can't format the post then, we are going to run the iFrame hack
				self.utils.post( format_url, p.data, ("post" in o ? o.post(p) : null), callback );

				return self;
			}

			// the delete callback needs a better response
			if(p.method === 'delete'){
				var _callback = callback;
				callback = function(r, code){
					_callback((!r||self.utils.isEmpty(r))? {response:'deleted'} : r, code);
				};
			}

			// Can we use XHR for Cross domain delivery?
			if( 'withCredentials' in new XMLHttpRequest() && ( !("xhr" in o) || ( o.xhr && o.xhr(p,qs) ) ) ){
				var x = self.utils.xhr( p.method, format_url, p.headers, p.data, callback );
				x.onprogress = function(e){
					self.emit("progress", e);
				};
				x.upload.onprogress = function(e){
					self.emit("uploadprogress", e);
				};
			}
			else{

				// Otherwise we're on to the old school, IFRAME hacks and JSONP
				// Preprocess the parameters
				// Change the p parameters
				if("jsonp" in o){
					o.jsonp(p,qs);
				}

				// Is this still a post?
				if( p.method === 'post' ){

					// Add some additional query parameters to the URL
					// We're pretty stuffed if the endpoint doesn't like these
					//			"suppress_response_codes":true
					qs.redirect_uri = self.settings.redirect_uri;
					qs.state = JSON.stringify({callback:'?'});

					self.utils.post( format_url, p.data, ("post" in o ? o.post(p) : null), callback, self.settings.timeout );
				}

				// Make the call
				else{

					qs = self.utils.merge(qs,p.data);
					qs.callback = '?';

					self.utils.jsonp( format_url, callback, self.settings.timeout );
				}
			}
		};

		// Make request
		if(typeof(url)==='function'){
			url(p, getPath);
		}
		else{
			getPath(url);
		}
	}
	else{
		this.emitAfter("complete error", {error:{
			code:'invalid_path',
			message:'The provided path is not available on the selected network'
		}});
	}

	return this;


	//
	// Add authentication to the URL
	function _sign(network, path, method, data, modifyQueryString, callback){

		// OAUTH SIGNING PROXY
		var session = new self.getAuthResponse(network),
			service = self.services[network],
			token = (session ? session.access_token : null);

		// Is this an OAuth1 endpoint
		var proxy = ( service.oauth && parseInt(service.oauth.version,10) === 1 ? self.settings.oauth_proxy : null);

		if(proxy){
			// Use the proxy as a path
			callback( self.utils.qs(proxy, {
				path : path,
				access_token : token||'',
				then : (method.toLowerCase() === 'get' ? 'redirect' : 'proxy'),
				method : method,
				suppress_response_codes : true
			}));
			return;
		}

		var qs = { 'access_token' : token||'' };

		if(modifyQueryString){
			modifyQueryString(qs);
		}

		callback(  self.utils.qs( path, qs) );
	}

};










///////////////////////////////////
// API Utilities
///////////////////////////////////

hello.utils.extend( hello.utils, {

	//
	// isArray
	isArray : function (o){
		return Object.prototype.toString.call(o) === '[object Array]';
	},


	// _DOM
	// return the type of DOM object
	domInstance : function(type,data){
		var test = "HTML" + (type||'').replace(/^[a-z]/,function(m){return m.toUpperCase();}) + "Element";
		if(window[test]){
			return data instanceof window[test];
		}else if(window.Element){
			return data instanceof window.Element && (!type || (data.tagName&&data.tagName.toLowerCase() === type));
		}else{
			return (!(data instanceof Object||data instanceof Array||data instanceof String||data instanceof Number) && data.tagName && data.tagName.toLowerCase() === type );
		}
	},

	//
	// XHR
	// This uses CORS to make requests
	xhr : function(method, pathFunc, headers, data, callback){

		var utils = this;

		if(typeof(pathFunc)!=='function'){
			var path = pathFunc;
			pathFunc = function(qs, callback){callback(utils.qs( path, qs ));};
		}

		var r = new XMLHttpRequest();

		// Binary?
		var binary = false;
		if(method==='blob'){
			binary = method;
			method = 'GET';
		}
		// UPPER CASE
		method = method.toUpperCase();

		// xhr.responseType = "json"; // is not supported in any of the vendors yet.
		r.onload = function(e){
			var json = r.response;
			try{
				json = JSON.parse(r.responseText);
			}catch(_e){
				if(r.status===401){
					json = {
						error : {
							code : "access_denied",
							message : r.statusText
						}
					};
				}
			}


			callback( json || ( method!=='DELETE' ? {error:{message:"Could not get resource"}} : {} ), r.status );
		};
		r.onerror = function(e){
			var json = r.responseText;
			try{
				json = JSON.parse(r.responseText);
			}catch(_e){}

			callback(json||{error:{
				code: "access_denied",
				message: "Could not get resource"
			}});
		};

		var qs = {}, x;

		// Should we add the query to the URL?
		if(method === 'GET'||method === 'DELETE'){
			if(!this.isEmpty(data)){
				qs = this.merge(qs, data);
			}
			data = null;
		}
		else if( data && typeof(data) !== 'string' && !(data instanceof FormData)){
			// Loop through and add formData
			var f = new FormData();
			for( x in data )if(data.hasOwnProperty(x)){
				if( data[x] instanceof HTMLInputElement ){
					if( "files" in data[x] && data[x].files.length > 0){
						f.append(x, data[x].files[0]);
					}
				}
				else{
					f.append(x, data[x]);
				}
			}
			data = f;
		}

		// Create url

		pathFunc(qs, function(url){

			// Open the path, async
			r.open( method, url, true );

			if(binary){
				if("responseType" in r){
					r.responseType = binary;
				}
				else{
					r.overrideMimeType("text/plain; charset=x-user-defined");
				}
			}

			// Set any bespoke headers
			if(headers){
				for(var x in headers){
					r.setRequestHeader(x, headers[x]);
				}
			}

			r.send( data );
		});


		return r;
	},


	//
	// JSONP
	// Injects a script tag into the dom to be executed and appends a callback function to the window object
	// @param string/function pathFunc either a string of the URL or a callback function pathFunc(querystringhash, continueFunc);
	// @param function callback a function to call on completion;
	//
	jsonp : function(pathFunc,callback,timeout){

		var utils = this;

		// Change the name of the callback
		var bool = 0,
			head = document.getElementsByTagName('head')[0],
			operafix,
			script,
			result = {error:{message:'server_error',code:'server_error'}},
			cb = function(){
				if( !( bool++ ) ){
					window.setTimeout(function(){
						callback(result);
						head.removeChild(script);
					},0);
				}
			};

		// Add callback to the window object
		var cb_name = this.globalEvent(function(json){
			result = json;
			return true; // mark callback as done
		});

		// The URL is a function for some cases and as such
		// Determine its value with a callback containing the new parameters of this function.
		if(typeof(pathFunc)!=='function'){
			var path = pathFunc;
			path = path.replace(new RegExp("=\\?(&|$)"),'='+cb_name+'$1');
			pathFunc = function(qs, callback){ callback(utils.qs(path, qs));};
		}


		pathFunc(function(qs){
				for(var x in qs){ if(qs.hasOwnProperty(x)){
					if (qs[x] === '?') qs[x] = cb_name;
				}}
			}, function(url){

			// Build script tag
			script = utils.append('script',{
				id:cb_name,
				name:cb_name,
				src: url,
				async:true,
				onload:cb,
				onerror:cb,
				onreadystatechange : function(){
					if(/loaded|complete/i.test(this.readyState)){
						cb();
					}
				}
			});

			// Opera fix error
			// Problem: If an error occurs with script loading Opera fails to trigger the script.onerror handler we specified
			// Fix:
			// By setting the request to synchronous we can trigger the error handler when all else fails.
			// This action will be ignored if we've already called the callback handler "cb" with a successful onload event
			if( window.navigator.userAgent.toLowerCase().indexOf('opera') > -1 ){
				operafix = utils.append('script',{
					text:"document.getElementById('"+cb_name+"').onerror();"
				});
				script.async = false;
			}

			// Add timeout
			if(timeout){
				window.setTimeout(function(){
					result = {error:{message:'timeout',code:'timeout'}};
					cb();
				}, timeout);
			}

			// Todo:
			// Add fix for msie,
			// However: unable recreate the bug of firing off the onreadystatechange before the script content has been executed and the value of "result" has been defined.
			// Inject script tag into the head element
			head.appendChild(script);
			
			// Append Opera Fix to run after our script
			if(operafix){
				head.appendChild(operafix);
			}

		});
	},


	//
	// Post
	// Send information to a remote location using the post mechanism
	// @param string uri path
	// @param object data, key value data to send
	// @param function callback, function to execute in response
	//
	post : function(pathFunc, data, options, callback, timeout){

		var utils = this;

		// The URL is a function for some cases and as such
		// Determine its value with a callback containing the new parameters of this function.
		if(typeof(pathFunc)!=='function'){
			var path = pathFunc;
			pathFunc = function(qs, callback){ callback(utils.qs(path, qs));};
		}

		// This hack needs a form
		var form = null,
			reenableAfterSubmit = [],
			newform,
			i = 0,
			x = null,
			bool = 0,
			cb = function(r){
				if( !( bool++ ) ){
					try{
						// remove the iframe from the page.
						//win.parentNode.removeChild(win);
						// remove the form
						if(newform){
							newform.parentNode.removeChild(newform);
						}
					}
					catch(e){
						try{
							console.error("HelloJS: could not remove iframe");
						}
						catch(ee){}
					}

					// reenable the disabled form
					for(var i=0;i<reenableAfterSubmit.length;i++){
						if(reenableAfterSubmit[i]){
							reenableAfterSubmit[i].setAttribute('disabled', false);
						}
					}

					// fire the callback
					callback(r);

					// Do not return true, as that will remove the listeners
					// return true;
				}
			};

		// What is the name of the callback to contain
		// We'll also use this to name the iFrame
		var callbackID = this.globalEvent(cb);

		// Build the iframe window
		var win;
		try{
			// IE7 hack, only lets us define the name here, not later.
			win = document.createElement('<iframe name="'+callbackID+'">');
		}
		catch(e){
			win = document.createElement('iframe');
		}

		win.name = callbackID;
		win.id = callbackID;
		win.style.display = 'none';

		// Override callback mechanism. Triggger a response onload/onerror
		if(options&&options.callbackonload){
			// onload is being fired twice
			win.onload = function(){
				cb({
					response : "posted",
					message : "Content was posted"
				});
			};
		}

		if(timeout){
			setTimeout(function(){
				cb({
					error : {
						code:"timeout",
						message : "The post operation timed out"
					}
				});
			}, timeout);
		}

		document.body.appendChild(win);


		// if we are just posting a single item
		if( utils.domInstance('form', data) ){
			// get the parent form
			form = data.form;
			// Loop through and disable all of its siblings
			for( i = 0; i < form.elements.length; i++ ){
				if(form.elements[i] !== data){
					form.elements[i].setAttribute('disabled',true);
				}
			}
			// Move the focus to the form
			data = form;
		}

		// Posting a form
		if( utils.domInstance('form', data) ){
			// This is a form element
			form = data;

			// Does this form need to be a multipart form?
			for( i = 0; i < form.elements.length; i++ ){
				if(!form.elements[i].disabled && form.elements[i].type === 'file'){
					form.encoding = form.enctype = "multipart/form-data";
					form.elements[i].setAttribute('name', 'file');
				}
			}
		}
		else{
			// Its not a form element,
			// Therefore it must be a JSON object of Key=>Value or Key=>Element
			// If anyone of those values are a input type=file we shall shall insert its siblings into the form for which it belongs.
			for(x in data) if(data.hasOwnProperty(x)){
				// is this an input Element?
				if( utils.domInstance('input', data[x]) && data[x].type === 'file' ){
					form = data[x].form;
					form.encoding = form.enctype = "multipart/form-data";
				}
			}

			// Do If there is no defined form element, lets create one.
			if(!form){
				// Build form
				form = document.createElement('form');
				document.body.appendChild(form);
				newform = form;
			}

			// Add elements to the form if they dont exist
			for(x in data) if(data.hasOwnProperty(x)){

				// Is this an element?
				var el = ( utils.domInstance('input', data[x]) || utils.domInstance('textArea', data[x]) || utils.domInstance('select', data[x]) );

				// is this not an input element, or one that exists outside the form.
				if( !el || data[x].form !== form ){

					// Does an element have the same name?
					if(form.elements[x]){
						// Remove it.
						form.elements[x].parentNode.removeChild(form.elements[x]);
					}

					// Create an input element
					var input = document.createElement('input');
					input.setAttribute('type', 'hidden');
					input.setAttribute('name', x);

					// Does it have a value attribute?
					if(el){
						input.value = data[x].value;
					}
					else if( utils.domInstance(null, data[x]) ){
						input.value = data[x].innerHTML || data[x].innerText;
					}else{
						input.value = data[x];
					}

					form.appendChild(input);
				}
				// it is an element, which exists within the form, but the name is wrong
				else if( el && data[x].name !== x){
					data[x].setAttribute('name', x);
					data[x].name = x;
				}
			}

			// Disable elements from within the form if they weren't specified
			for(i=0;i<form.children.length;i++){
				// Does the same name and value exist in the parent
				if( !( form.children[i].name in data ) && form.children[i].getAttribute('disabled') !== true ) {
					// disable
					form.children[i].setAttribute('disabled',true);
					// add re-enable to callback
					reenableAfterSubmit.push(form.children[i]);
				}
			}
		}


		// Set the target of the form
		form.setAttribute('method', 'POST');
		form.setAttribute('target', callbackID);
		form.target = callbackID;


		// Call the path
		pathFunc( {}, function(url){

			// Replace the second '?' with the callback_id


			form.setAttribute('action', url);

			// Submit the form
			setTimeout(function(){
				form.submit();
			},100);
		});

		// Build an iFrame and inject it into the DOM
		//var ifm = _append('iframe',{id:'_'+Math.round(Math.random()*1e9), style:shy});
		
		// Build an HTML form, with a target attribute as the ID of the iFrame, and inject it into the DOM.
		//var frm = _append('form',{ method: 'post', action: uri, target: ifm.id, style:shy});

		// _append('input',{ name: x, value: data[x] }, frm);
	},


	//
	// Some of the providers require that only MultiPart is used with non-binary forms.
	// This function checks whether the form contains binary data
	hasBinary : function (data){
		for(var x in data ) if(data.hasOwnProperty(x)){
			if( (this.domInstance('input', data[x]) && data[x].type === 'file')	||
				("FileList" in window && data[x] instanceof window.FileList) ||
				("File" in window && data[x] instanceof window.File) ||
				("Blob" in window && data[x] instanceof window.Blob)
			){
				return true;
			}
		}
		return false;
	},

	//
	// dataToJSON
	// This takes a FormElement and converts it to a JSON object
	//
	dataToJSON : function (p){

		var utils = this;

		var data = p.data;

		// Is data a form object
		if( this.domInstance('form', data) ){
			// Get the first FormElement Item if its an type=file
			var kids = data.elements;

			var json = {};

			// Create a data string
			for(var i=0;i<kids.length;i++){

				var input = kids[i];

				// If the name of the input is empty or diabled, dont add it.
				if(input.disabled||!input.name){
					continue;
				}

				// Is this a file, does the browser not support 'files' and 'FormData'?
				if( input.type === 'file' ){
					// the browser does not XHR2
					if("FormData" in window){
						// include the whole element
						json[input.name] = input;
						continue;
					}
					else if( !("files" in input) ){

						// Cancel this approach the browser does not support the FileAPI
						return false;
					}
				}
				else{
					json[ input.name ] = input.value || input.innerHTML;
				}
			}

			// Convert to a postable querystring
			data = json;
		}

		// Is this a form input element?
		if( this.domInstance('input', data) ){
			// Get the Input Element
			// Do we have a Blob data?
			if("files" in data){

				var o = {};
				o[ data.name ] = data.files;
				// Turn it into a FileList
				data = o;
			}
			else{
				// This is old school, we have to perform the FORM + IFRAME + HASHTAG hack
				return false;
			}
		}

		// Is data a blob, File, FileList?
		if( ("File" in window && data instanceof window.File) ||
			("Blob" in window && data instanceof window.Blob) ||
			("FileList" in window && data instanceof window.FileList) ){

			// Convert to a JSON object
			data = {'file' : data};
		}

		// Loop through data if its not FormData it must now be a JSON object
		if( !( "FormData" in window && data instanceof window.FormData ) ){

			// Loop through the object
			for(var x in data) if(data.hasOwnProperty(x)){

				// FileList Object?
				if("FileList" in window && data[x] instanceof window.FileList){
					// Get first record only
					if(data[x].length===1){
						data[x] = data[x][0];
					}
					else{
						//("We were expecting the FileList to contain one file");
					}
				}
				else if( this.domInstance('input', data[x]) && data[x].type === 'file' ){

					if( ( "files" in data[x] ) ){
						// this supports HTML5
						// do nothing
					}
					else{
						// this does not support HTML5 forms FileList
						return false;
					}
				}
				else if( this.domInstance('input', data[x]) ||
					this.domInstance('select', data[x]) ||
					this.domInstance('textArea', data[x])
					){
					data[x] = data[x].value;
				}
				else if( this.domInstance(null, data[x]) ){
					data[x] = data[x].innerHTML || data[x].innerText;
				}
			}
		}

		// Data has been converted to JSON.
		p.data = data;

		return true;
	}
});

//
// Dropbox
//
(function(){

function formatError(o){
	if(o&&"error" in o){
		o.error = {
			code : "server_error",
			message : o.error.message || o.error
		};
	}
}
	
function format_file(o){

	if(typeof(o)!=='object' ||
		"Blob" in window && o instanceof Blob ||
		"ArrayBuffer" in window && o instanceof ArrayBuffer){
		// this is a file, let it through unformatted
		return;
	}
	if("error" in o){
		return;
	}

	var path = o.root + o.path.replace(/\&/g, '%26');
	if(o.thumb_exists){
		o.thumbnail = hello.settings.oauth_proxy + "?path=" +
		encodeURIComponent('https://api-content.dropbox.com/1/thumbnails/'+ path + '?format=jpeg&size=m') + '&access_token=' + hello.getAuthResponse('dropbox').access_token;
	}
	o.type = ( o.is_dir ? 'folder' : o.mime_type );
	o.name = o.path.replace(/.*\//g,'');
	if(o.is_dir){
		o.files = 'metadata/' + path;
	}
	else{
		o.downloadLink = hello.settings.oauth_proxy + "?path=" +
		encodeURIComponent('https://api-content.dropbox.com/1/files/'+ path ) + '&access_token=' + hello.getAuthResponse('dropbox').access_token;
		o.file = 'https://api-content.dropbox.com/1/files/'+ path;
	}
	if(!o.id){
		o.id = o.name;
	}
//	o.media = "https://api-content.dropbox.com/1/files/" + path;
}

hello.init({
	'dropbox' : {

		login : function(p){
			// The dropbox login window is a different size.
			p.options.window_width = 1000;
			p.options.window_height = 1000;
		},

		/*
		// DropBox does not allow Unsecure HTTP URI's in the redirect_uri field
		// ... otherwise i'd love to use OAuth2
		// Follow request https://forums.dropbox.com/topic.php?id=106505

		//p.qs.response_type = 'code';
		oauth:{
			version:2,
			auth	: "https://www.dropbox.com/1/oauth2/authorize",
			grant	: 'https://api.dropbox.com/1/oauth2/token'
		},
		*/
		oauth : {
			version : "1.0",
			auth	: "https://www.dropbox.com/1/oauth/authorize",
			request : 'https://api.dropbox.com/1/oauth/request_token',
			token	: 'https://api.dropbox.com/1/oauth/access_token'
		},

		// AutoRefresh
		// Signin once token expires?
		autorefresh : false,

		uri : {
			//auth	: "https://www.dropbox.com/1/oauth/authorize",
			base	: "https://api.dropbox.com/1/",
			me		: 'account/info',
			"me/files"	: function(p,callback){
				if(p.method === 'get'){
					callback('metadata/dropbox');
					return;
				}
				var path = p.data.dir;
				delete p.data.dir;
				callback('https://api-content.dropbox.com/1/files/dropbox/'+path);
			},
			"me/folders" : function(p, callback){
				var name = p.data.name;
				p.data = null;
				callback('fileops/create_folder?'+hello.utils.param({
					path : name,
					root : 'dropbox'
				}));
			},
			"default" : function(p,callback){
				if(p.path.match("https://api-content.dropbox.com/1/files/")){
					// this is a file, return binary data
					if(p.method === 'get'){
						p.method = 'blob';
					}
				}
				callback(p.path);
			}
		},
		wrap : {
			me : function(o){
				formatError(o);
				if(!o.uid){
					return o;
				}
				o.name = o.display_name;
				o.first_name = o.name.split(" ")[0];
				o.last_name = o.name.split(" ")[1];
				o.id = o.uid;
				delete o.uid;
				delete o.display_name;
				return o;
			},
			"default"	: function(o){
				formatError(o);
				if(o.is_dir && o.contents){
					o.data = o.contents;
					delete o.contents;

					for(var i=0;i<o.data.length;i++){
						o.data[i].root = o.root;
						format_file(o.data[i]);
					}
				}

				format_file(o);

				return o;
			}
		},
		// doesn't return the CORS headers
		xhr : function(p){
			// forgetting content DropBox supports the allow-cross-origin-resource
			if(p.path.match("https://api-content.dropbox.com/")){
				//p.data = p.data.file.files[0];
				return false;
			}
			else if(p.path.match("me/files")&&p.method==='post'){
				return true;
			}
			return true;
		}
	}
});

})();

//
// Facebook
//
hello.init({
	facebook : {
		name : 'Facebook',

		uri : {
			// REF: http://developers.facebook.com/docs/reference/dialogs/oauth/
			auth : 'http://www.facebook.com/dialog/oauth/',
			base : 'https://graph.facebook.com/',
			'me/share' : 'me/feed',
			'me/files' : 'me/albums'
		},
		scope : {
			basic			: '',
			email			: 'email',
			birthday		: 'user_birthday',
			events			: 'user_events',
			photos			: 'user_photos,user_videos',
			videos			: 'user_photos,user_videos',
			friends			: '',
			files			: 'user_photos,user_videos',
			
			publish_files	: 'user_photos,user_videos,publish_stream',
			publish			: 'publish_stream',
			create_event	: 'create_event',

			offline_access : 'offline_access'
		},
		wrap : {
			me : function(o){
				if(o.id){
					o.picture = 'http://graph.facebook.com/'+o.id+'/picture';
					o.thumbnail = 'http://graph.facebook.com/'+o.id+'/picture';
				}
				return o;
			},
			'me/friends' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						o.data[i].picture = 'http://graph.facebook.com/'+o.data[i].id+'/picture';
						o.data[i].thumbnail = 'http://graph.facebook.com/'+o.data[i].id+'/picture';
					}
				}
				return o;
			},
			'me/albums' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						o.data[i].files = 'https://graph.facebook.com/'+o.data[i].id+'/photos';
						o.data[i].photos = 'https://graph.facebook.com/'+o.data[i].id+'/photos';
						if(o.data[i].cover_photo){
							o.data[i].thumbnail = 'https://graph.facebook.com/'+o.data[i].cover_photo+'/picture?access_token='+hello.getAuthResponse('facebook').access_token;
						}
						o.data[i].type = "album";
						if(o.data[i].can_upload){
							o.data[i].upload_location = 'https://graph.facebook.com/'+o.data[i].id+'/photos';
						}
					}
				}
				return o;
			},
			'me/files' : function(o){return this["me/albums"](o);},
			'default' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						if(o.data[i].picture){
							o.data[i].thumbnail = o.data[i].picture;
						}
						if(o.data[i].cover_photo){
							o.data[i].thumbnail = 'https://graph.facebook.com/'+o.data[i].cover_photo+'/picture?access_token='+hello.getAuthResponse('facebook').access_token;
						}
					}
				}
				return o;
			}
		},

		// special requirements for handling XHR
		xhr : function(p,qs){
			if(p.method==='get'||p.method==='post'){
				qs.suppress_response_codes = true;
				return true;
			}
			else{
				return false;
			}
		},

		// Special requirements for handling JSONP fallback
		jsonp : function(p){
			if( p.method.toLowerCase() !== 'get' && !hello.utils.hasBinary(p.data) ){
				p.data.method = p.method.toLowerCase();
				p.method = 'get';
			}
		},

		// Special requirements for iframe form hack
		post : function(p){
			return {
				// fire the callback onload
				callbackonload : true
			};
		}
	}
});
//
// Flickr
//
(function(){


function getApiUrl(method, extra_params, skip_network){
	var url=((skip_network) ? "" : "flickr:") +
			"?method=" + method +
			"&api_key="+ hello.init().flickr.id +
			"&format=json";
	for (var param in extra_params){ if (extra_params.hasOwnProperty(param)) {
		url += "&" + param + "=" + extra_params[param];
		// url += "&" + param + "=" + encodeURIComponent(extra_params[param]);
	}}
	return url;
}

function withUser(cb){
	if(!flickr_user){
		hello.api(getApiUrl("flickr.test.login"), function(userJson){
			flickr_user = {"user_id" : checkResponse(userJson, "user").id};
			cb();
		});
	}
	else{
		cb();
	}
}

function sign(url){
	return function(p, callback){
		withUser(function(){
			callback(getApiUrl(url, flickr_user, true));
		});
	};
}


function getBuddyIcon(profile, size){
	var url="http://www.flickr.com/images/buddyicon.gif";
	if (profile.nsid && profile.iconserver && profile.iconfarm){
		url="http://farm" + profile.iconfarm + ".staticflickr.com/" +
			profile.iconserver + "/" +
			"buddyicons/" + profile.nsid +
			((size) ? "_"+size : "") + ".jpg";
	}
	return url;
}

function getPhoto(id, farm, server, secret, size){
	size = (size) ? "_"+size : '';
	return "http://farm"+farm+".staticflickr.com/"+server+"/"+id+"_"+secret+size+".jpg";
}

function formatUser(o){
}

function formatError(o){
	if(o && o.stat && o.stat.toLowerCase()!='ok'){
		o.error = {
			code : "invalid_request",
			message : o.message
		};
	}
}

function formatPhotos(o){
	if (o.photoset || o.photos){
		var set = (o.photoset) ? 'photoset' : 'photos';
		o = checkResponse(o, set);
		o.data = o.photo;
		delete o.photo;
		for(var i=0;i<o.data.length;i++){
			var photo = o.data[i];
			photo.name = photo.title;
			photo.picture = getPhoto(photo.id, photo.farm, photo.server, photo.secret, '');
			photo.source = getPhoto(photo.id, photo.farm, photo.server, photo.secret, 'b');
			photo.thumbnail = getPhoto(photo.id, photo.farm, photo.server, photo.secret, 'm');
		}
	}
}
function checkResponse(o, key){

	if( key in o) {
		o = o[key];
	}
	else if(!("error" in o)){
		o.error = {
			code : "invalid_request",
			message : o.message || "Failed to get data from Flickr"
		};
	}
	return o;
}


// this is not exactly neat but avoid to call
// the method 'flickr.test.login' for each api call
var flickr_user;

hello.init({
	'flickr' : {
		// Ensure that you define an oauth_proxy
		oauth : {
			version : "1.0a",
			auth	: "http://www.flickr.com/services/oauth/authorize?perms=read",
			request : 'http://www.flickr.com/services/oauth/request_token',
			token	: 'http://www.flickr.com/services/oauth/access_token'
		},
		logout : function(){
			// Function is executed when the user logs out.
			flickr_user = null;
		},

		// AutoRefresh
		// Signin once token expires?
		autorefresh : false,


		name : "Flickr",
		jsonp: function(p,qs){
			if(p.method.toLowerCase() == "get"){
				delete qs.callback;
				qs.jsoncallback = '?';
			}
		},
		uri : {
			base		: "http://api.flickr.com/services/rest",
			"me"		: sign("flickr.people.getInfo"),
			"me/friends": sign("flickr.contacts.getList"),
			"me/albums"	: sign("flickr.photosets.getList"),
			"me/photos" : sign("flickr.people.getPhotos")
		},
		wrap : {
			me : function(o){
				formatError(o);
				o = checkResponse(o, "person");
				if(o.id){
					if(o.realname){
						o.name = o.realname._content;
						var m = o.name.split(" ");
						o.first_name = m[0];
						o.last_name = m[1];
					}
					o.thumbnail = getBuddyIcon(o, 'l');
					o.picture = getBuddyIcon(o, 'l');
				}
				return o;
			},
			"me/friends" : function(o){
				formatError(o);
				if(o.contacts){
					o.data = o.contacts.contact;
					delete o.contacts;
					for(var i=0;i<o.data.length;i++){
						var item = o.data[i];
						item.id = item.nsid;
						item.name = item.realname || item.username;
						item.thumbnail = getBuddyIcon(item, 'm');
					}
				}
				return o;
			},
			"me/albums" : function(o){
				formatError(o);
				o = checkResponse(o, "photosets");
				if(o.photosets){
					o.data = o.photoset;
					delete o.photoset;
					for(var i=0;i<o.data.length;i++){
						var item = o.data[i];
						item.name = item.title._content;
						item.photos = "http://api.flickr.com/services/rest" + getApiUrl("flickr.photosets.getPhotos", {photoset_id: item.id}, true);
					}
				}
				return o;
			},
			"me/photos" : function(o){
				formatError(o);
				formatPhotos(o);

				return o;
			},
			"default" : function(o){

				formatError(o);
				formatPhotos(o);

				return o;
			}
		},
		xhr : false
	}
});
})();
//
// FourSquare
//
hello.init({
	foursquare : {
		name : 'FourSquare',
		// Alter the querystring
		querystring : function(qs){
			var token = qs.access_token;
			delete qs.access_token;
			qs.oauth_token = token;
			qs.v = 20121125;
		},
		uri : {
			auth : 'https://foursquare.com/oauth2/authenticate',
			base : 'https://api.foursquare.com/v2/',
			'me' : 'users/self'
		},
		wrap : {
			me : function(o){
				if(o.meta&&o.meta.code===400){
					o = {
						error : {
							code : "access_denied",
							message : o.meta.errorDetail
						}
					};
					return o;
				}
				if(o && o.response){
					o = o.response.user;
					if(o.id){
						o.thumbnail = o.photo.prefix + '100x100'+ o.photo.suffix;
						o.name = o.firstName + ' ' + o.lastName;
					}
				}
				return o;
			},
			'default' : function(){

			}
		}
	}
});
//
// GitHub
//
(function(){

function formatError(o,code){
	code = code || ( o && "meta" in o && "status" in o.meta && o.meta.status );
	if( (code===401||code===403) ){
		o.error = {
			code : "access_denied",
			message : o.message
		};
		delete o.message;
	}
}

hello.init({
	github : {
		name : 'GitHub',
		oauth : {
			version : 2,
			grant : 'https://github.com/login/oauth/access_token'
		},
		uri : {
			auth : 'https://github.com/login/oauth/authorize',
			base : 'https://api.github.com/',
			'me' : 'user',
			'me/friends' : 'user/following'
		},
		wrap : {
			me : function(o,code){

				formatError(o,code);

				if(o.id){
					o.picture = o.avatar_url;
					o.thumbnail = o.avatar_url;
					o.name = o.login;
				}
				return o;
			},
			"me/friends" : function(o,code){

				formatError(o,code);

				if(Object.prototype.toString.call(o) === '[object Array]'){
					return {data:o};
				}
				return o;
			}
		}
	}
});

})();
//
// GOOGLE API
//
(function(){

	// Format
	// Ensure each record contains a name, id etc.
	function formatItem(o){
		if(o.error){
			return;
		}
		if(!o.name){
			o.name = o.title || o.message;
		}
		if(!o.picture){
			o.picture = o.thumbnailLink;
		}
		if(!o.thumbnail){
			o.thumbnail = o.thumbnailLink;
		}
		if(o.mimeType === "application/vnd.google-apps.folder"){
			o.type = "folder";
			o.files = "https://www.googleapis.com/drive/v2/files?q=%22"+o.id+"%22+in+parents";
		}
	}

	// Google has a horrible JSON API
	function gEntry(o){

		var entry = function(a){

			var media = a['media$group']['media$content'].length ? a['media$group']['media$content'][0] : {};
			var i=0, _a;
			var p = {
				id		: a.id.$t,
				name	: a.title.$t,
				description	: a.summary.$t,
				updated_time : a.updated.$t,
				created_time : a.published.$t,
				picture : media ? media.url : null,
				thumbnail : media ? media.url : null,
				width : media.width,
				height : media.height
//				original : a
			};
			// Get feed/children
			if("link" in a){
				for(i=0;i<a.link.length;i++){
					if(a.link[i].rel.match(/\#feed$/)){
						p.photos = a.link[i].href;
						p.files = a.link[i].href;
						p.upload_location = a.link[i].href;
						break;
					}
				}
			}

			// Get images of different scales
			if('category' in a&&a['category'].length){
				_a  = a['category'];
				for(i=0;i<_a.length;i++){
					if(_a[i].scheme&&_a[i].scheme.match(/\#kind$/)){
						p.type = _a[i].term.replace(/^.*?\#/,'');
					}
				}
			}

			// Get images of different scales
			if('media$thumbnail' in a['media$group'] && a['media$group']['media$thumbnail'].length){
				_a = a['media$group']['media$thumbnail'];
				p.thumbnail = a['media$group']['media$thumbnail'][0].url;
				p.images = [];
				for(i=0;i<_a.length;i++){
					p.images.push({
						source : _a[i].url,
						width : _a[i].width,
						height : _a[i].height
					});
				}
				_a = a['media$group']['media$content'].length ? a['media$group']['media$content'][0] : null;
				if(_a){
					p.images.push({
						source : _a.url,
						width : _a.width,
						height : _a.height
					});
				}
			}
			return p;
		};

		var r = [];
		if("feed" in o && "entry" in o.feed){
			for(i=0;i<o.feed.entry.length;i++){
				r.push(entry(o.feed.entry[i]));
			}
			return {
				//name : o.feed.title.$t,
				//updated : o.feed.updated.$t,
				data : r
			};
		}

		// Old style, picasa, etc...
		if( "entry" in o ){
			return entry(o.entry);
		}else if( "items" in o ){
			for(var i=0;i<o.items.length;i++){
				formatItem( o.items[i] );
			}
			return {
				data : o.items
			};
		}
		else{
			formatItem( o );
			return o;
		}
	}



	//
	// Embed
	hello.init({
		google : {
			name : "Google Plus",

			// Login
			login : function(p){
				// Google doesn't like display=none
				if(p.qs.display==='none'){
					p.qs.display = '';
				}
			},

			uri : {
				// REF: http://code.google.com/apis/accounts/docs/OAuth2UserAgent.html
				auth : "https://accounts.google.com/o/oauth2/auth",
	//				me	: "plus/v1/people/me?pp=1",
				me : 'oauth2/v1/userinfo?alt=json',
				base : "https://www.googleapis.com/",
				'me/friends' : 'https://www.google.com/m8/feeds/contacts/default/full?alt=json&max-results=1000',
				'me/share' : 'plus/v1/people/me/activities/public',
				'me/feed' : 'plus/v1/people/me/activities/public',
				'me/albums' : 'https://picasaweb.google.com/data/feed/api/user/default?alt=json',
				'me/photos' : 'https://picasaweb.google.com/data/feed/api/user/default?alt=json&kind=photo&max-results=100',
				"me/files" : 'https://www.googleapis.com/drive/v2/files?q=%22root%22+in+parents'
			},
			scope : {
				//,
				basic : "https://www.googleapis.com/auth/plus.me https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
				email			: '',
				birthday		: '',
				events			: '',
				photos			: 'https://picasaweb.google.com/data/',
				videos			: 'http://gdata.youtube.com',
				friends			: 'https://www.google.com/m8/feeds',
				files			: 'https://www.googleapis.com/auth/drive.readonly',
				
				publish			: '',
				publish_files	: 'https://www.googleapis.com/auth/drive',
				create_event	: '',

				offline_access : ''
			},
			scope_delim : ' ',
			wrap : {
				me : function(o){
					if(o.id){
						o.last_name = o.family_name || (o.name? o.name.familyName : null);
						o.first_name = o.given_name || (o.name? o.name.givenName : null);
	//						o.name = o.first_name + ' ' + o.last_name;
						o.picture = o.picture || ( o.image ? o.image.url : null);
						o.thumbnail = o.picture;
						o.name = o.displayName || o.name;
					}
					return o;
				},
				'me/friends'	: function(o){
					var r = [];
					if("feed" in o && "entry" in o.feed){
						for(var i=0;i<o.feed.entry.length;i++){
							var a = o.feed.entry[i];
							r.push({
								id		: a.id.$t,
								name	: a.title.$t,
								email	: (a.gd$email&&a.gd$email.length>0)?a.gd$email[0].address:null,
								updated_time : a.updated.$t,
								picture : (a.link&&a.link.length>0)?a.link[0].href+'?access_token='+hello.getAuthResponse('google').access_token:null,
								thumbnail : (a.link&&a.link.length>0)?a.link[0].href+'?access_token='+hello.getAuthResponse('google').access_token:null
							});
						}
						return {
							//name : o.feed.title.$t,
							//updated : o.feed.updated.$t,
							data : r
						};
					}
					return o;
				},
				'me/share' : function(o){
					o.data = o.items;
					try{
						delete o.items;
					}catch(e){
						o.items = null;
					}
					return o;
				},
				'me/feed' : function(o){
					o.data = o.items;
					try{
						delete o.items;
					}catch(e){
						o.items = null;
					}
					return o;
				},
				'me/albums' : gEntry,
				'me/photos' : gEntry,
				'default' : gEntry
			},
			xhr : function(p){
				if(p.method==='post'){
					return false;
				}
				return true;
			}
		}
	});
})();
//
// Instagram
//
(function(){

function formatError(o){
	if(o && "meta" in o && "error_type" in o.meta){
		o.error = {
			code : o.meta.error_type,
			message : o.meta.error_message
		};
	}
}


hello.init({
	instagram : {
		name : 'Instagram',
		login: function(p){
			// Instagram throws errors like "Javascript API is unsupported" if the display is 'popup'.
			// Make the display anything but 'popup'
			p.qs.display = '';
		},
		uri : {
			auth : 'https://instagram.com/oauth/authorize/',
			base : 'https://api.instagram.com/v1/',
			'me' : 'users/self',
			'me/feed' : 'users/self/feed',
			'me/photos' : 'users/self/media/recent?min_id=0&count=100',
			'me/friends' : 'users/self/follows'
		},
		scope : {
			basic : 'basic'
		},
		wrap : {
			me : function(o){

				formatError(o);

				if("data" in o ){
					o.id = o.data.id;
					o.thumbnail = o.data.profile_picture;
					o.name = o.data.full_name || o.data.username;
				}
				return o;
			},
			"me/photos" : function(o){

				formatError(o);

				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						if(o.data[i].type !== 'image'){
							delete o.data[i];
							i--;
						}
						o.data[i].thumbnail = o.data[i].images.thumbnail.url;
						o.data[i].picture = o.data[i].images.standard_resolution.url;
						o.data[i].name = o.data[i].caption ? o.data[i].caption.text : null;
					}
				}
				return o;
			}
		},
		// Use JSONP
		xhr : false
	}
});
})();
//
// Linkedin
//
(function(){

function formatError(o){
	if(o && "errorCode" in o){
		o.error = {
			code : o.status,
			message : o.message
		};
	}
}


function formatUser(o){
	if(o.error){
		return;
	}
	o.first_name = o.firstName;
	o.last_name = o.lastName;
	o.name = o.formattedName || (o.first_name + ' ' + o.last_name);
	o.thumbnail = o.pictureUrl;
}

hello.init({
	'linkedin' : {

		login: function(p){
			p.qs.response_type = 'code';
		},
		oauth : {
			version : 2,
			grant	: "https://www.linkedin.com/uas/oauth2/accessToken"
		},
		querystring : function(qs){
			// Linkedin signs requests with the parameter 'oauth2_access_token'... yeah anotherone who thinks they should be different!
			qs.oauth2_access_token = qs.access_token;
			delete qs.access_token;
		},
		uri : {
			auth	: "https://www.linkedin.com/uas/oauth2/authorization",
			base	: "https://api.linkedin.com/v1/",
			me		: 'people/~:(picture-url,first-name,last-name,id,formatted-name)',
			"me/friends"	: 'people/~/connections',
			"me/share" : function(p, next){
				// POST unsupported
				next( p.method === 'get' ? 'people/~/network/updates' : 'people/~/current-status' );
			}
		},
		scope : {
			basic	: 'r_fullprofile',
			email	: 'r_emailaddress',
			friends : 'r_network',
			publish : 'rw_nus'
		},
		scope_delim : ' ',
		wrap : {
			me : function(o){
				formatError(o);
				formatUser(o);
				return o;
			},
			"me/friends" : function(o){
				formatError(o);
				if(o.values){
					o.data = o.values;
					for(var i=0;i<o.data.length;i++){
						formatUser(o.data[i]);
					}
					delete o.values;
				}
				return o;
			},
			"me/share" : function(o){
				formatError(o);
				if(o.values){
					o.data = o.values;
					for(var i=0;i<o.data.length;i++){
						formatUser(o.data[i]);
						o.data[i].message = o.data[i].headline;
					}
					delete o.values;
				}
				return o;
			}
		},
		jsonp : function(p,qs){
			qs.format = 'jsonp';
			if(p.method==='get'){
				qs['error-callback'] = '?';
			}
		},
		xhr : false
	}
});

})();

//
// SoundCloud
//
hello.init({
	soundcloud : {
		name : 'SoundCloud',

		// AutoRefresh
		// Signin once token expires?
		autorefresh : false,

		// Alter the querystring
		querystring : function(qs){
			var token = qs.access_token;
			delete qs.access_token;
			qs.oauth_token = token;
			qs['_status_code_map[302]'] = 200;
		},
		// Request path translated
		uri : {
			auth : 'https://soundcloud.com/connect',
			base : 'https://api.soundcloud.com/',
			'default' : function(p, callback){
				// include ".json at the end of each request"
				callback(p.path + '.json');
			}
		},
		// Response handlers
		wrap : {
			me : function(o){
				if(o.id){
					o.picture = o.avatar_url;
					o.thumbnail = o.avatar_url;
					o.name = o.username;
				}
				return o;
			}
		}
	}
});
//
// Twitter
//
(function(){


function formatUser(o){
	if(o.id){
		if(o.name){
			var m = o.name.split(" ");
			o.first_name = m[0];
			o.last_name = m[1];
		}
		o.thumbnail = o.profile_image_url;
	}
}

function formatFriends(o){
	formaterror(o);
	if(o.users){
		o.data = o.users;
		for(var i=0;i<o.data.length;i++){
			formatUser(o.data[i]);
		}
		delete o.users;
	}
	return o;
}

function formaterror(o){
	if(o.errors){
		var e = o.errors[0];
		o.error = {
			code : "request_failed",
			message : e.message
		};
	}
}

/*
// THE DOCS SAY TO DEFINE THE USER IN THE REQUEST
// ... although its not actually required.

var user_id;

function withUserId(callback){
	if(user_id){
		callback(user_id);
	}
	else{
		hello.api('twitter:/me', function(o){
			user_id = o.id;
			callback(o.id);
		});
	}
}

function sign(url){
	return function(p, callback){
		withUserId(function(user_id){
			callback(url+'?user_id='+user_id);
		});
	};
}
*/

hello.init({
	'twitter' : {
		// Ensure that you define an oauth_proxy
		oauth : {
			version : "1.0a",
			auth	: "https://twitter.com/oauth/authorize",
			request : 'https://twitter.com/oauth/request_token',
			token	: 'https://twitter.com/oauth/access_token'
		},

		// AutoRefresh
		// Signin once token expires?
		autorefresh : false,

		uri : {
			base	: "https://api.twitter.com/1.1/",
			me		: 'account/verify_credentials.json',
			"me/friends"	: 'friends/list.json',
			"me/following"	: 'friends/list.json',
			"me/followers"	: 'followers/list.json',
			'me/share' : function(p,callback){
				var data = p.data;
				p.data = null;

				callback( p.method==='post' ? 'statuses/update.json?include_entities=1&status='+data.message : 'statuses/user_timeline.json' );
			}
		},
		wrap : {
			me : function(o){
				formaterror(o);
				formatUser(o);
				return o;
			},
			"me/friends" : formatFriends,
			"me/followers" : formatFriends,
			"me/following" : formatFriends,

			"me/share" : function(o){
				formaterror(o);
				if(!o.error&&"length" in o){
					return {data : o};
				}
				return o;
			}
		},
		xhr : function(p){
			// Rely on the proxy for non-GET requests.
			return (p.method!=='get');
		}
	}
});

})();

//
// Windows
//
hello.init({
	windows : {
		name : 'Windows live',

		uri : {
			// REF: http://msdn.microsoft.com/en-us/library/hh243641.aspx
			auth : 'https://login.live.com/oauth20_authorize.srf',
			base : 'https://apis.live.net/v5.0/',
			"me/share" : function(p,callback){
				// If this is a POST them return
				callback( p.method==='get' ? "me/feed" : "me/share" );
			},
			"me/feed" : function(p,callback){
				// If this is a POST them return
				callback( p.method==='get' ? "me/feed" : "me/share" );
			},
			"me/files" : 'me/skydrive/files'

		},
		scope : {
			basic			: 'wl.signin,wl.basic',
			email			: 'wl.emails',
			birthday		: 'wl.birthday',
			events			: 'wl.calendars',
			photos			: 'wl.photos',
			videos			: 'wl.photos',
			friends			: '',
			files			: 'wl.skydrive',
			
			publish			: 'wl.share',
			publish_files	: 'wl.skydrive_update',
			create_event	: 'wl.calendars_update,wl.events_create',

			offline_access	: 'wl.offline_access'
		},
		wrap : {
			me : function(o){
				if(o.id){
					o.email = (o.emails?o.emails.preferred:null);
					o.picture = 'https://apis.live.net/v5.0/'+o.id+'/picture?access_token='+hello.getAuthResponse('windows').access_token;
					o.thumbnail = 'https://apis.live.net/v5.0/'+o.id+'/picture?access_token='+hello.getAuthResponse('windows').access_token;
				}
				return o;
			},
			'me/friends' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						o.data[i].picture = 'https://apis.live.net/v5.0/'+o.data[i].id+'/picture?access_token='+hello.getAuthResponse('windows').access_token;
						o.data[i].thumbnail = 'https://apis.live.net/v5.0/'+o.data[i].id+'/picture?access_token='+hello.getAuthResponse('windows').access_token;
					}
				}
				return o;
			},
			'me/albums' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						o.data[i].photos = 'https://apis.live.net/v5.0/'+o.data[i].id+'/photos';
						o.data[i].files = 'https://apis.live.net/v5.0/'+o.data[i].id+'/photos';
					}
				}
				return o;
			},
			'default' : function(o){
				if("data" in o){
					for(var i=0;i<o.data.length;i++){
						if(o.data[i].picture){
							o.data[i].thumbnail = o.data[i].picture;
						}
					}
				}
				return o;
			}
		},
		xhr : false,
		jsonp : function(p){
			if( p.method.toLowerCase() !== 'get' && !hello.utils.hasBinary(p.data) ){
				//p.data = {data: JSON.stringify(p.data), method: p.method.toLowerCase()};
				p.data.method = p.method.toLowerCase();
				p.method = 'get';
			}
		}
	}
});
//
// Yahoo
//
// Register Yahoo developer
(function(){

function formatError(o){
	if(o && "meta" in o && "error_type" in o.meta){
		o.error = {
			code : o.meta.error_type,
			message : o.meta.error_message
		};
	}
}

hello.init({
	'yahoo' : {
		// Ensure that you define an oauth_proxy
		oauth : {
			version : "1.0a",
			auth	: "https://api.login.yahoo.com/oauth/v2/request_auth",
			request : 'https://api.login.yahoo.com/oauth/v2/get_request_token',
			token	: 'https://api.login.yahoo.com/oauth/v2/get_token'
		},

		// AutoRefresh
		// Signin once token expires?
		autorefresh : false,

		uri : {
			base	: "https://social.yahooapis.com/v1/",
			me		: "http://query.yahooapis.com/v1/yql?q=select%20*%20from%20social.profile%20where%20guid%3Dme&format=json",
			"me/friends"	: 'http://query.yahooapis.com/v1/yql?q=select%20*%20from%20social.contacts%20where%20guid=me&format=json'
		},
		wrap : {
			me : function(o){
				formatError(o);
				if(o.query&&o.query.results&&o.query.results.profile){
					o = o.query.results.profile;
					o.id = o.guid;
					o.name = o.givenName + ' ' +o.familyName;
					o.last_name = o.familyName;
					o.first_name = o.givenName;
					o.email = o.emails?o.emails.handle:null;
					o.thumbnail = o.image?o.image.imageUrl:null;
				}
				return o;
			},
			// Can't get ID's
			// It might be better to loop through the social.relationshipd table with has unique ID's of users.
			"me/friends" : function(o){
				formatError(o);
				var contact,field;
				if(o.query&&o.query.results&&o.query.results.contact){
					o.data = o.query.results.contact;
					delete o.query;
					for(var i=0;i<o.data.length;i++){
						contact = o.data[i];
						o.data[i].id = null;
						for(var j=0;j<contact.fields.length;j++){
							field = contact.fields[j];
							if(field.type === 'email'){
								o.data[i].email = field.value;
							}
							if(field.type === 'name'){
								o.data[i].first_name = field.value.givenName;
								o.data[i].last_name = field.value.familyName;
								o.data[i].name = field.value.givenName + ' ' + field.value.familyName;
							}
							if(field.type === 'yahooid'){
								o.data[i].id = field.value;
							}
						}
					}
				}
				return o;
			}
		},
		xhr : false
	}
});

})();
