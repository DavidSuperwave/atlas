/**
 * Shim for vertx module
 * 
 * The 'when' package (used by gologin's requestretry dependency)
 * tries to require 'vertx' which is a Vert.x runtime module that
 * doesn't exist in Node.js. This shim provides empty exports to
 * prevent the build from failing.
 * 
 * The 'when' package has fallback logic that uses setTimeout/clearTimeout
 * when vertx is not available, so this shim is safe.
 */

module.exports = {};

