var socket = io({type: 'client'});
var deckSize = 0;
var currentPlayer = {cid: null};
var cardPendingPlayed = null;
var lastPlayedCard = null;
var clients = [];

function log(text)
{
    $('#logBox').text(text);
}

function changeName()
{
    socket.emit('client rename', $('#ownName').val());
}

function createDeck(client)
{
    return '<div class="deck' + (client.id === socket.id ? ' own-deck' : '') + '" id="deck-' + client.id + '" data-cid="' + client.id + '"><span id="deck-name-' + client.id + '" class="deck-name">' + client.name + '</span><div class="deck-cards" id="deck-cards-' + client.id + '"></div></div>';
}

function createColorChooserOverlay()
{
    return '<div class="card-color-chooser card-color-chooser-red" data-color="' + types.COLOR.RED + '"></div><div class="card-color-chooser card-color-chooser-green" data-color="' + types.COLOR.GREEN + '"></div><div class="card-color-chooser card-color-chooser-blue" data-color="' + types.COLOR.BLUE + '"></div><div class="card-color-chooser card-color-chooser-yellow" data-color="' + types.COLOR.YELLOW + '"></div>';
}

function createCard(card)
{
    return '<div class="card-container"><div class="card card-' + (card.color === types.COLOR.SECRET ? 'secret' : types.colorToString(card.color).toLowerCase()) + ' card-' + (card.face === types.FACE.SECRET ? 'secret' : card.face) + '" data-color="' + card.color + '" data-face="' + card.face + '"><div class="card-inner"></div><div class="card-face-center">' + types.faceToString(card.face) + '</div><div class="card-face-top">' + types.faceToString(card.face) + '</div><div class="card-face-bottom">' + types.faceToString(card.face) + '</div></div></div>';
}

function setNewClientList(newClientList)
{
    var clientListDom = $('#clientList');
    var deckContainer = $('#decks');
    clientListDom.empty();
    newClientList.forEach(client => {
        clientListDom.append($('<li>').text(client.name));

        // Add deck for new clients
        let existingDom = $('#deck-name-' + client.id);
        if (existingDom.length === 0) deckContainer.append(createDeck(client));

        // Rename self (server and admin can rename clients)
        if (client.id === socket.id) $('#ownName').val(client.name);
    });

    // Remove disconnected clients
    clients.forEach(oldClient => {
        let newClientId = newClientList.findIndex(newClient => newClient.id === oldClient.id);
        // Remove deck of disconnected clients
        if (newClientId === -1) $('#deck-' + oldClient.id).remove();
        // Update name of existing clients
        else $('#deck-name-' + oldClient.id).text(newClientList[newClientId].name);
    });

    clients = newClientList;
}

function pullCard(cardPull)
{
    let cardElem = $(createCard(cardPull.card));
    $('#deck-cards-' + cardPull.cid).append(cardElem);
    cardElem.click(playCard);
}

function playCard(evt)
{
    console.log('play card: ', evt);
    if (currentPlayer.cid !== socket.id) return;
    console.log('I am the current');
    let domElem = $(evt.target);
    let chosenColor = null;
    if (! domElem.hasClass('card'))
    {
        if (domElem.hasClass('card-color-chooser'))
        {
            chosenColor = domElem.data('color');
        }
        let parents = domElem.parents('.card');
        if (parents.length === 0) return;
        domElem = $(parents[0]);
    }
    $('.card-color-chooser').remove();
    if (domElem.parents('.own-deck').length === 0) return;
    console.log('Clicked own card');
    let card = {color: domElem.data('color'), face: domElem.data('face')};
    if (! types.cardCanBePlayedOn(card, lastPlayedCard)) return;
    console.log('Card can be played: ', card);
    if (types.hasChoosableColor(card))
    {
        if (chosenColor === null)
        {
            domElem.append(createColorChooserOverlay());
            return;
        }
        else
        {
            card.color = chosenColor;
        }
    }
    cardPendingPlayed = domElem;
    socket.emit('play card', card);

}

$(function () {
    socket.on('client list', function(clientList) {
        console.log("New client list");
        console.log(clientList);
        setNewClientList(clientList);
    });

    socket.on('card pulled', function(cardPull) {
        console.log('card pulled', cardPull);
        pullCard(cardPull);
        --deckSize;
        $('#deckSize').text(deckSize);
    });

    socket.on('game restarted', function() {
        console.log('game restarted');
        $('.card:not(#main-deck-card)').remove();
        $('#playedCards').empty();
        deckSize = types.CARD_CNT;
        $('#deckSize').text(deckSize);
    });

    socket.on('current player', function(client) {
        console.log('current player', client);
        currentPlayer = client;
        $('.deck').removeClass('current-player');
        $('#deck-' + client.cid).addClass('current-player');
    });

    socket.on('card played', function(event) {
        console.log('card played', event);
        let newCardDom = $(createCard(event.card));
        newCardDom.css('transform', 'rotate(' + Math.floor(Math.random() * 360) + 'deg)').children('.card').addClass('played-card');
        $('#playedCards').append(newCardDom);
        lastPlayedCard = event.card;
        if (event.cid === null) return;
        if (event.cid === socket.id)
        {
            if (cardPendingPlayed !== null)
            {
                cardPendingPlayed.remove();
                cardPendingPlayed = null;
            }
        }
        else
        {
            $('#deck-cards-' + event.cid).children().last().remove();
        }
    });

    socket.on('log', function(msg) {
        log(msg);
    });

    $('#deckSize').text(deckSize);

    $('#mainDeck').click(function(evt) {
        console.log('draw card:');
        if (currentPlayer.cid !== socket.id) return;
        socket.emit('draw card');
    });
});