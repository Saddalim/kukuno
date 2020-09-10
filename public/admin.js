var socket = io({type: 'admin'});

$(function() {

    let clientListDom = $('#clientList');
    let giveCardTargetList = $('#giveCardTarget');
    let giveCardSelectorsDom = $('#giveCardSelectors');

    // Create give card buttons

    for (let cardFace = 0; cardFace <= types.FACE.PLUS2; ++cardFace)
    {
        let newElem = '<div class="cardColorGroup"><h2>' + types.faceToSymbol(cardFace) + '</h2><hr>';
        for (let colorId = 0; colorId <= 3; ++colorId)
        {
            newElem += '<button class="addCardBtn color-' + colorId + '" data-color="' + colorId + '" data-face="' + cardFace + '">' + types.colorToString(colorId) + '</button>';
        }
        newElem += '</div>';
        giveCardSelectorsDom.append(newElem);
    }

    giveCardSelectorsDom.append('<div class="cardColorGroup"><h2>' + types.faceToSymbol(types.FACE.COLORSWITCH) + '</h2><hr><button class="addCardBtn color--1" data-color="' + types.COLOR.BLACK + '" data-face="' + types.FACE.COLORSWITCH + '">Black</button></div>');
    giveCardSelectorsDom.append('<div class="cardColorGroup"><h2>' + types.faceToSymbol(types.FACE.PLUS4) + '</h2><hr><button class="addCardBtn color--1" data-color="' + types.COLOR.BLACK + '" data-face="' + types.FACE.PLUS4 + '">Black</button></div>');

    socket.on('client list', function(clientList)
    {
        console.log('client list', clientList);
        clientListDom.empty();
        giveCardTargetList.empty();
        clientList.forEach(client =>
        {
            let newElem = '<span class="clientBox">';
            newElem += '[' + client.id + '] ' + client.name;
            newElem += '<select id="playerstate-' + client.id + '">';
            for (let state = 1; state <= types.PLAYER_STATE.OUT; ++state)
            {
                newElem += '<option value="' + state + '"' + (state === types.PLAYER_STATE.OUT ? 'selected' : '') +'>' + types.playerStateToString(state).toLocaleUpperCase() + '</option>';
            }
            newElem += '</select>';
            newElem += '<button class="setStateBtn" data-cid="' + client.id + '">Set</button>';
            newElem += '</span>';

            clientListDom.append(newElem);
            giveCardTargetList.append('<option value="' + client.id + '">' + client.name + '</option>')
        });

        $('.setStateBtn').click(function (evt)
        {
            let cid = $(evt.target).data('cid');
            let data = {cid: cid, state: $('#playerstate-' + cid).val()};
            console.log(data);
            socket.emit('admin set state', data);
        });
    });

    socket.on('client state changed', function(data)
    {
        console.log('client state changed', data);
        $('#playerstate-' + data.cid).val(data.state);
    });

    $('.addCardBtn').click(function(evt) {
        socket.emit('admin draw', {cid: $('#giveCardTarget').val(), color: $(evt.target).data('color'), face: $(evt.target).data('face')})
    });

    $('#cmd-restart').click(function() {
        socket.emit('admin restart');
    });

    $('#cmd-advance').click(function() {
        socket.emit('admin advance');
    });

    $('#cmd-flip-direction').click(function() {
        socket.emit('admin flip direction');
    });
});