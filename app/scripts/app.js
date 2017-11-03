/**
 * Application angular qui permet d'afficher la page et de connecter les websockets.
 * 
 * @author ZUBER Lionel <lionel.zuber@armaklan.org>
 * @version 0.1
 * @license MIT
 */

var logApp = angular.module('logApp', ['luegg.directives', 'ngResource', 'angularTreeview']);

logApp.factory('FoldersService', ['$resource', function ($resource) {
  return $resource('/folders', {}, {
    query: { method: 'GET', isArray: false },
    sub: { method: 'GET', isArray: false, url: '/folders/:index/:path' }
  });
}])

logApp.factory('socket', function ($rootScope) {
  return {
    giveSocket: function () {
      var disconnecting = false;
      var socket = {};
      return {
        connect: function () {
          disconnecting = false;
          socket = io.connect("/view");
        },
        on: function (eventName, callback) {
          socket.on(eventName, function () {
            var args = arguments;
            if (!disconnecting) {
              $rootScope.$apply(function () {
                callback.apply(socket, args);
              });
            }
          });
        },
        emit: function (eventName, data, callback) {
          socket.emit(eventName, data, function () {
            var args = arguments;
            $rootScope.$apply(function () {
              if (callback) {
                callback.apply(socket, args);
              }
            });
          })
        },
        disconnect: function () {
          disconnecting = true;
          socket.disconnect();
        },
        socket: socket
      };
    }
  }
});

logApp.controller('logAppCtrl', function (FoldersService, socket, $scope) {

  $scope.query = "";
  $scope.msg = [];
  $scope.selectedLog = -1;
  $scope.glued = true;

  $scope.folders = []

  FoldersService.query({}, function (data) {
    if (data.success) {
      var folders = data.folders
      folders.forEach(function (folder) {
        $scope.folders.push(folder)
      })
    }
  });

  $scope.path = ''

  $scope.$watch('files.currentNode', function (node) {
    if (!node) {
      $scope.path = null;
      return;
    }
    if ($scope.sock != null) {
      $scope.sock.disconnect();
      $scope.msg = [];
    }
    $scope.sock = socket.giveSocket();
    $scope.sock.connect('/view');
    $scope.sock.on('Log', function (result) {
      $scope.msg.push(result);
      if ($scope.msg.length > 300) {
        $scope.msg.shift();
      }
    });
    $scope.sock.emit('init', node.path);
    $scope.path = node.path
  });

  $scope.sock = null;
});
