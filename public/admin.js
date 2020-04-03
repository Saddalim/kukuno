var socket = io({type: 'admin'});

$(function() {
    $('#cmd-restart').click(function() {
        socket.emit('game restart');
    });
});