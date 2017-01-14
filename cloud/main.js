Parse.Cloud.job('userInfoMigration', function(request, status) {
    Parse.Cloud.useMasterKey();
    var userQuery = new Parse.Query('_User');
    userQuery.find()
    .then(function(results) {
        for(var i=0;i<results.length;i++) {
            var currentMyGender = results[i].get('myGender');
            var toBeMyGender = 0;
            if(currentMyGender == 0) {
                toBeMyGender = 1;
            } else if(currentMyGender == 1) {
                toBeMyGender = 2;
            }
            results[i].set('myGender', toBeMyGender);

            var curreytMyAge = results[i].get('myAge');
            var tobeMyAge = 0;
            if(curreytMyAge >= 0 && curreytMyAge <= 5) {
                tobeMyAge = curreytMyAge + 1;
            }
            results[i].set('myAge', tobeMyAge);

            var currentMyArea = results[i].get('myArea');
            var tobeMyArea = 0;
            if(currentMyArea >= 0 && currentMyArea <= 15) {
                tobeMyArea = currentMyArea + 1;
            }
            results[i].set('myArea', tobeMyArea);

            results[i].set('filterGender', 0);
            results[i].set('filterArea', 0);
            results[i].set('filterAge', 0);

        }
        return Parse.Object.saveAll(results);
    }).then(function() {
        status.success('migration success');
    },function(error) {
        status.error('fail');
    });
});

Parse.Cloud.job('ResetDailyValue', function(request, status) {
    Parse.Cloud.useMasterKey();
    var userQuery = new Parse.Query('_User');
    userQuery.find().then(function(results) {
        var allUser = [];
        for(var i=0;i<results.length;i++) {
            results[i].set('areaSelectionCount', 20);
            results[i].set('dailyReportCount', 0);
            allUser.push(results[i]);
        }
        return Parse.Object.saveAll(allUser);
    }).then(function() {
        status.success('reset success');
    },function(error){
        status.error('reset  fail '+error.message );
    });
});

Parse.Cloud.beforeSave('Message', function(request, response) {
    var connection = request.object.get('connection');
    if(connection == null) {
        response.success();
    } else {
        connection.fetch().then(function(result) {
            var connected = result.get('connected');
            if(connected) {
                response.success();
            } else {
                response.error('already disconnected');
            }
        },function(error) {

        });
    }
});


Parse.Cloud.afterSave('Message', function(request) {

    var receiver = new Parse.Object('_User');
    receiver.id = request.object.get('receiver').id;

    if(request.object.get('push')) {

        var connection;

        if(request.object.get('connection') == null) {
            connection = new Parse.Object('Connection');
            var users = [];
        users.push(request.object.get('sender'));
        users.push(request.object.get('receiver'));
        connection.set('users', users);
        connection.set('connected', true);
        } else {
            connection = request.object.get('connection');
        }

        connection.set('lastMessage', request.object);
        connection.save().then(function() {
            request.object.set('connection', connection);
            request.object.set('push', false);
            return request.object.save();
        }).then(function() {
            var installationQuery = new Parse.Query(Parse.Installation);
            installationQuery.equalTo('user', receiver);
            return Parse.Push.send({
                        where: installationQuery, // Set our Installation query
                        data: {
                            alert : '[속삭임]메세지가 도착했습니다',
                            data : {
                                    pushType : 0,
                                    body : {
                                        objectId : connection.id
                                    }
                            },
                            badge : 1,
                            sound : 'default'
                        }
                    });
        }).then(function() {
            console.log('push success');
        }, function(error) {
        });
    }
});


Parse.Cloud.define('userList', function(request, response) {
    Parse.Cloud.useMasterKey();

    var user;
    var connectedUserIds = [];

    var emptyUser = new Parse.User();
    emptyUser.id = request.params.objectId;
    emptyUser.fetch().then(function(result) {
        console.log('사용자 패치 : ' + result.id);
        user = result;
        var userAr = [];
        userAr.push(user);
        var connectionQuery = new Parse.Query('Connection');
        connectionQuery.containedIn('users', userAr);
        connectionQuery.equalTo('connected', true);
        return connectionQuery.find();
    }).then(function(results) {
        console.log('현재 대화중인 상대의 수 : ' + results.length);

        for(var i=0;i<results.length;i++) {
            connectedUserIds.push(results[i].get('users')[0].id == user.id ? results[i].get('users')[1].id : results[i].get('users')[0].id);
        }

        var userQuery = new Parse.Query('_User');
        if(user.get('myGender') == user.get('yourGender')) {
            userQuery.notEqualTo('objectId', user.id);
        }

        var filterGender = user.get('filterGender');
        if(filterGender > 0) {
            userQuery.equalTo('myGender', filterGender);
        }

        var filterArea = user.get('filterArea');
        if(filterArea > 0) {
            userQuery.equalTo('myArea', filterArea);
        }

        var filterAge = user.get('filerAge');
        if(filterAge > 0) {
            userQuery.equalTo('myAge', filterAge);
        }

        userQuery.notEqualTo('objectId', user.id);
        userQuery.notContainedIn('objectId', user.get('blockUser'));
        userQuery.limit(request.params.limit);
        userQuery.skip(request.params.limit * request.params.index);
        userQuery.descending('updatedAt');
        return userQuery.find();
    }).then(function(results) {
        console.log('찾은 상대방 수 : ' + results.length);

        console.log('connection : ' + connectedUserIds.length);

        var connectionExceptUsers = [];
            var myBlockUser = user.get('blockUser');
            for(var i=0;i<results.length;i++) {
                if( (connectedUserIds == null || connectedUserIds.length == 0 || !connectedUserIds.contains(results[i].id))
                    && (myBlockUser == null || myBlockUser.length == 0 || !myBlockUser.contains(results[i].id))) {
                    connectionExceptUsers.push(results[i]);
                }
            }


        console.log('내 블럭 리스트와 컨넥션 제외 수 : ' + connectionExceptUsers.length);
        var info = {};
        info.userList = connectionExceptUsers;
        var returnValue =JSON.stringify(info);
        response.success(returnValue);
    }, function(error) {
        response.error('error');
    });
});

Parse.Cloud.define("find", function(request, response) {

    Parse.Cloud.useMasterKey();

    var user;

    var emptyUser = new Parse.User();
    var monthAgo = new Date();
    var usedAreaSelection;
    var users = [];
    var botList = [];
    botList.push('bot_man');
    botList.push('bot_women');
    monthAgo.setMonth(monthAgo.getMonth()-1);

    emptyUser.id = request.params.objectId;
    emptyUser.fetch().then(function(result) {
        console.log('사용자 패치 : ' + result.id);
        user = result;
        var userAr = [];
        userAr.push(user);
        var connectionQuery = new Parse.Query('Connection');
        connectionQuery.containedIn('users', userAr);
        connectionQuery.equalTo('connected', true);
        return connectionQuery.find();
    }).then(function(results) {
        console.log('현재 대화중인 상대의 수 : ' + results.length);
        for(var i=0;i<results.length;i++) {
            users.push(results[i].get('users')[0].id == user.id ? results[i].get('users')[1].id : results[i].get('users')[0].id);
        }
        var userQuery = new Parse.Query('_User');
        userQuery.equalTo('myGender', user.get('yourGender'));
        if(user.get('myGender') == 1 || (user.get('myGender') == 0 && user.get('areaSelectionCount') > 0)) {
            userQuery.equalTo('myArea', user.get('yourArea'));
            userQuery.equalTo('myAge', user.get('yourAge'));
        }

        if(user.get('myGender') == user.get('yourGender'))
            userQuery.notEqualTo('objectId', user.id);

        userQuery.greaterThan('lastConnected', monthAgo);
        userQuery.notContainedIn('objectId', users);
        userQuery.notContainedIn('username', botList);
        return userQuery.find();
    }).then(function(results) {
        console.log('모든 조건이 만족하는 상대방 수 : ' + results.length);
        usedAreaSelection = results.length > 0;
        if(results.length > 0) {
            return results;
        } else {

            var userQuery = new Parse.Query('_User');
            userQuery.equalTo('myGender', user.get('yourGender'));
            if(user.get('myGender') == 1 || (user.get('myGender') == 0 && user.get('areaSelectionCount') > 0)) {
                userQuery.equalTo('myAge', user.get('yourAge'));
            }

            if(user.get('myGender') == user.get('yourGender'))
                userQuery.notEqualTo('objectId', user.id);

            userQuery.notContainedIn('objectId', users);
            userQuery.greaterThan('lastConnected', monthAgo);
            userQuery.notContainedIn('username', botList);
            return userQuery.find();
        }
    }).then(function(results) {
        console.log('지역조건을 제외하고 만족하는 상대방 수 : ' + results.length);
        if(results.length > 0) {
            return results;
        } else {
            var userQuery = new Parse.Query('_User');
            userQuery.equalTo('myGender', user.get('yourGender'));
            if(user.get('myGender') == user.get('yourGender'))
                userQuery.notEqualTo('objectId', user.id);

            userQuery.notContainedIn('objectId', users);
            userQuery.greaterThan('lastConnected', monthAgo);
            userQuery.notContainedIn('username', botList);
            return userQuery.find();
        }
    }).then(function(results) {
        console.log('지역, 나이를 제외하고 만족하는 상대방 수 : ' + results.length);
        if(results.length > 0) {
            return results;
        } else {
            var userQuery = new Parse.Query('_User');
            userQuery.equalTo('myGender', user.get('yourGender'));
            if(user.get('myGender') == 1 || (user.get('myGender') == 0 && user.get('areaSelectionCount') > 0)) {
                userQuery.equalTo('myArea', user.get('yourArea'));
                userQuery.equalTo('myAge', user.get('yourAge'));
            }

            if(user.get('myGender') == user.get('yourGender'))
                userQuery.notEqualTo('objectId', user.id);

            userQuery.notContainedIn('objectId', users);
            userQuery.notContainedIn('username', botList);
            return userQuery.find();
        }
    }).then(function(results) {
        console.log('최근 접속일을 제외하고 만족하는 상대방 수 : ' + results.length);
        if(results.length > 0) {
            return results;
        } else {
            var userQuery = new Parse.Query('_User');
            userQuery.equalTo('myGender', user.get('yourGender'));

            if(user.get('myGender') == user.get('yourGender'))
                userQuery.notEqualTo('objectId', user.id);

            userQuery.notContainedIn('objectId', users);
            userQuery.notContainedIn('username', botList);
            return userQuery.find();
        }
    }).then(function(results) {
        console.log('최근접속일, 나이, 지역을 제외하고 만족하는 상대 수 : ' + results.length);
        if(results.length > 0) {
            return results;
        } else {
            var userQuery = new Parse.Query('_User');
            userQuery.equalTo('myGender', user.get('yourGender'));

            if(user.get('myGender') == user.get('yourGender'))
                userQuery.notEqualTo('objectId', user.id);

            userQuery.containedIn('username', botList);
            return userQuery.find();
        }
    }).then(function(results) {
        var info = {};
        if(results.length > 0) {
            console.log('bot 호출');
            var random = Math.floor(Math.random() * results.length);
            info.objectId = results[random].id;
        } else {
            info.objectId = '';
        }

        info.usedAreaSelection = usedAreaSelection;
        var returnValue =JSON.stringify(info);
        response.success(returnValue);
    },function(error) {
        response.error(error.messgae+', line : ' + error.lineno);
    });
});


Parse.Cloud.define('appInfo', function(request, response) {
    var inspectionInfo = new Object();
    var versionInfo = new Object();
    var noticeInfo = new Object();
    var privateInfo = new Object();
    var adInfo = [];
    var videoAdInfo = [];
    var areaInfo = new Object();
    var os = request.params.os;
    if(os == null)
        os = 0;

    os = parseInt(os);

     if(os < 0  || os > 1)
        os = 0;

    var inspectionQuery = new Parse.Query('Inspection');
    inspectionQuery.find().then(function(results) {
        if(results.length > 0) {
            inspectionInfo.status = results[0].get('status');
            inspectionInfo.message = results[0].get('message');
        } else {
            inspectionInfo.status = false;
            inspectionInfo.message = '정상 서비스 중입니다.';
        }

        var versionQuery = new Parse.Query('Version');
        versionQuery.limit(1);
        versionQuery.equalTo('os', os);
        versionQuery.descending('createdAt');
        return versionQuery.find();
    }).then(function(results) {

        if(results.length > 0) {
            versionInfo.major = results[0].get('major');
            versionInfo.minor = results[0].get('minor');
            versionInfo.content = results[0].get('content');
        }

        var adQuery = new Parse.Query('Ad');
        adQuery.equalTo('os', os);
        return adQuery.find();
    }).then(function(results) {
        for(var i=0;i<results.length;i++) {
            var ad = new Object();
            ad.position = results[i].get('position');
            ad.enable = results[i].get('enable');
            ad.type = results[i].get('type');
            ad.customKey = results[i].get('customKey');
            ad.customIcon = results[i].get('customIcon') != null ? results[i].get('customIcon').url() : null;
            ad.customLink = os == 0 ? results[i].get('linkAndroid') : results[i].get('linkIOS');
            ad.defaultKey = results[i].get('defaultKey');
            adInfo.push(ad);
        }
        var videoAdQuery = new Parse.Query('VideoAd');
                videoAdQuery.equalTo('os', os);
                return videoAdQuery.find();
      }).then(function(results) {
        console.log('VideoAd : ' + results.length);
          for(var i=0;i<results.length;i++) {
            var name = results[i].get('name');
            var key = results[i].get('key');
            var value = results[i].get('value');
            var enable = results[i].get('enable');
            var data = {};
            data.key = key;
            data.value = value;
            console.log('name : ' + name +', key : ' + key + ', value : '  + value +', enable : ' + enable);
            if(enable) {
              var exist = false;
              for(var j=0; j<videoAdInfo.length; j++) {
                if(videoAdInfo[j].name == name) {
                  exist = true;
                  videoAdInfo[j].data.push(data);
                  break;
                }
              }

              if(!exist) {
                var videoAd = {};
                videoAd.name = name;
                videoAd.data = [];
                videoAd.data.push(data);
                videoAdInfo.push(videoAd);
              }
            }
          }
        var noticeQuery = new Parse.Query('Notice');
        noticeQuery.limit(1);
        noticeQuery.descending('version');
        return noticeQuery.find();
    }).then(function(results) {
        if(results.length > 0) {
            noticeInfo.title = results[0].get('title');
            noticeInfo.type = results[0].get('type');
            noticeInfo.version = results[0].get('version');

            if(noticeInfo.type == 0 || noticeInfo.type == 1) {
                noticeInfo.content = results[0].get('content');
            }

            if(noticeInfo.type == 2) {
                noticeInfo.pic = results[0].get('pic').url();
            }

            if(noticeInfo.type == 1 || noticeInfo.type == 2) {
                noticeInfo.linkUrl = os == 0 ? results[0].get('linkAndroid') : results[0].get('linkIOS');
            }
        }

        var areaQuery = new Parse.Query('Area');
        areaQuery.ascending('index');
        return areaQuery.find();
    }).then(function(results) {

        var areaArray = [];
        for(var i=0;i<results.length;i++) {
            var area = {};
            area.index = results[i].get('index');
            area.name = results[i].get('name');
            areaArray.push(area);
        }

        areaInfo = areaArray;

        var privateInfoQuery = new Parse.Query('PrivateInfo');
        return privateInfoQuery.find();
    }).then(function(results) {
        if(results.length > 0) {
            privateInfo.version = results[0].get('version');
            privateInfo.serviceInfo = results[0].get('serviceInfo');
            privateInfo.privateInfo = results[0].get('privateInfo');
        }

       var filterQuery = new Parse.Query('Filter');
       return filterQuery.find();
    }).then(function(results) {
        var filterInfo = new Object();
        var filterArray = [];
        for(var i=0;i<results.length;i++) {
            filterArray.push(results[i].get('word'));
        }
        filterInfo = filterArray;

        var info = {};
        info.inspection = inspectionInfo;
        info.notice = noticeInfo;
        info.version = versionInfo;
        info.adInfo = adInfo;
        info.videoAdInfo = videoAdInfo;
        info.areaInfo = areaInfo;
        info.privateInfo = privateInfo;
        info.filterInfo = filterInfo;
        info.help = true;
        var returnValue =JSON.stringify(info);
        response.success(returnValue);
    }, function(error) {
        response.error(error.message);
    });
});

Parse.Cloud.define('withdraw', function(request, response) {
  Parse.Cloud.useMasterKey();
  var currentUser;
  var emptyUser = new Parse.User();
  emptyUser.id = request.params.objectId;
  emptyUser.fetch().then(function(result) {
    currentUser = result;
    var users = [];
    users.push(currentUser);
    var connectionQuery = new Parse.Query('Connection');
    connectionQuery.containedIn('users', users);
    return connectionQuery.find();
  }).then(function(results) {
    return Parse.Object.destroyAll(results);
  }).then(function(results) {
    var messageQuery = new Parse.Query('Message');
    messageQuery.equalTo('sender', currentUser);
    return messageQuery.find();
  }).then(function(results){
    return Parse.Object.destroyAll(results);
  }).then(function(results) {
    var messageQuery = new Parse.Query('Message');
    messageQuery.equalTo('receiver', currentUser);
    return messageQuery.find();
  }).then(function(results) {
    return Parse.Object.destroyAll(results);
  }).then(function(results) {
    return currentUser.destroy();
  }).then(function(results) {
    response.success('success');
  }, function(error) {
    response.error('fail');
  });
});

Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}
