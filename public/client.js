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

/**
 * Sends a rename request to the server
 */
function changeName()
{
    socket.emit('client rename', $('#ownName').val());
}

/**
 * Create a HTML DOM element string representing the given client's deck
 * @param client Client as {id, name}
 * @returns {string}
 */
function createDeck(client)
{
    return '<div class="deck' + (client.id === socket.id ? ' own-deck' : '') + '" id="deck-' + client.id + '" data-cid="' + client.id + '"><span id="deck-name-' + client.id + '" class="deck-name">' + client.name + '</span><div class="deck-cards" id="deck-cards-' + client.id + '"></div></div>';
}

/**
 * Creates a HTML DOM element string representing a color chooser overlay for black cards
 * @returns {string}
 */
function createColorChooserOverlay()
{
    return '<div class="card-color-chooser card-color-chooser-red" data-color="' + types.COLOR.RED + '"></div><div class="card-color-chooser card-color-chooser-green" data-color="' + types.COLOR.GREEN + '"></div><div class="card-color-chooser card-color-chooser-blue" data-color="' + types.COLOR.BLUE + '"></div><div class="card-color-chooser card-color-chooser-yellow" data-color="' + types.COLOR.YELLOW + '"></div>';
}

/**
 * Creates a HTML DOM element string representing the given card
 * @param card Card given as {color, face}
 * @returns {string}
 */
function createCard(card)
{
    return '<div class="card-container"><div class="card card-' + (card.color === types.COLOR.SECRET ? 'secret' : types.colorToString(card.color).toLowerCase()) + ' card-' + (card.face === types.FACE.SECRET ? 'secret' : card.face) + '" data-color="' + card.color + '" data-face="' + card.face + '"><div class="card-inner"></div><div class="card-face-center">' + types.faceToString(card.face) + '</div><div class="card-face-top">' + types.faceToString(card.face) + '</div><div class="card-face-bottom">' + types.faceToString(card.face) + '</div></div></div>';
}

/**
 * Updates DOM elements based on the given client list. Disappeared clients will be removed, new will be added,
 * the already existing clients will have their names and deck appearances' updated
 * @param newClientList Client list as an array of {id, name}
 */
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

/**
 * Requests to pull a card from the server, if possible
 * @param cardPull
 */
function pullCard(cardPull)
{
    console.log('pull card');
    if (currentPlayer.cid !== socket.id) return;
    let cardElem = $(createCard(cardPull.card));
    $('#deck-cards-' + cardPull.cid).append(cardElem);
    cardElem.click(playCard);
}

/**
 * Requests to play a card from the server, if possible
 * TODO async card plays, starter card plays
 * @param evt
 */
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
    /**
     * New client list msg
     */
    socket.on('client list', function(clientList) {
        console.log("New client list");
        console.log(clientList);
        setNewClientList(clientList);
    });

    /**
     * Someone pulled a card from the pull deck
     */
    socket.on('card pulled', function(cardPull) {
        console.log('card pulled', cardPull);
        pullCard(cardPull);
        --deckSize;
        $('#deckSize').text(deckSize);
    });

    /**
     * Game completely restarted
     */
    socket.on('game restarted', function() {
        console.log('game restarted');
        $('.card:not(#main-deck-card)').remove();
        $('#playedCards').empty();
        deckSize = types.CARD_CNT;
        $('#deckSize').text(deckSize);
    });

    /**
     * Current player changed (turn advanced) to given player as {cid}
     */
    socket.on('current player', function(client) {
        console.log('current player', client);
        currentPlayer = client;
        $('.deck').removeClass('current-player');
        $('#deck-' + client.cid).addClass('current-player');
    });

    /**
     * Someone legally played a card from his/her deck. Given as {cid, card{color, face}}
     */
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

    /**
     * Log message from the server to be displayed
     */
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