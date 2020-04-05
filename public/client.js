var socket = io({type: 'client'});
var deckSize = 0;
var currentPlayer = {cid: null};
var cardPendingPlayed = null;
var lastPlayedCard = null;
var willSayUnoOnNextCard = false;
var clients = [];
var msgBox = null;

function log(text)
{
    console.log("Log: ", text);
    msgBox.text(text);
    msgBox.fadeIn(100).delay(1500).fadeOut(100);
}

/**
 * Gets the name of the client with the given ID
 * TODO make it more efficient
 * @param cid
 * @returns {string} The name, if client is known, "???" otherwise
 */
function getNameOfClient(cid)
{
    for (let clientIdx = 0; clientIdx < clients.length; ++clientIdx)
    {
        if (clients[clientIdx].id === cid) return clients[clientIdx].name;
    }
    return "???";
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
    return '<div class="deck' + (client.id === socket.id ? ' own-deck' : '') + '" id="deck-' + client.id + '" data-cid="' + client.id + '"><span id="deck-name-' + client.id + '" class="deck-name">' + client.name + '</span> - ' + (client.id === socket.id ? '<button class="say-uno-btn" id="say-uno-' + client.id + '" disabled>UNO!</button>' : '<a href="#" class="uno-report-btn" id="uno-report-' + client.id + '" data-cid="' + client.id + '">Nem mondta, hogy UNO!</a>') + '<div class="deck-cards" id="deck-cards-' + client.id + '"></div></div>';
}

/**
 * Creates a HTML DOM element string representing a color chooser overlay for black cards
 * @returns {string}
 */
function createColorChooserOverlay()
{
    return '<div class="card-overlay card-color-chooser card-color-chooser-red" data-color="' + types.COLOR.RED + '"></div><div class="card-overlay card-color-chooser card-color-chooser-green" data-color="' + types.COLOR.GREEN + '"></div><div class="card-overlay card-color-chooser card-color-chooser-blue" data-color="' + types.COLOR.BLUE + '"></div><div class="card-overlay card-color-chooser card-color-chooser-yellow" data-color="' + types.COLOR.YELLOW + '"></div>';
}

/**
 * Creates a HTML DOM element string representing a deck chooser overlay for 0 cards
 * @returns {string}
 */
function createDeckChooserOverlay()
{
    return '<div class="card-overlay card-deck-chooser">Kivel?</div>';
}

/**
 * Creates a HTML DOM element string representing an overlay for decks when choosing replacement deck with 0 card
 * @returns {string}
 */
function createDeckChosantOverlay()
{
    return '<div class="card-overlay deck-chooser-overlay"></div>';
}

/**
 * Creates a HTML DOM element string representing the given card
 * @param card Card given as {color, face}
 * @returns {string}
 */
function createCard(card)
{
    return '<div class="card-container"><div class="card card-' + (card.color === types.COLOR.SECRET ? 'secret' : types.colorToString(card.color).toLowerCase()) + ' card-' + (card.face === types.FACE.SECRET ? 'secret' : card.face) + '" data-color="' + card.color + '" data-face="' + card.face + '"><div class="card-inner"></div><div class="card-num card-face-center" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div><div class="card-num card-face-top" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div><div class="card-num card-face-bottom" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div></div></div>';
}

/**
 * Gets the number of own cards
 * @returns {number}
 */
function getOwnCardCnt()
{
    return $($('.own-deck')[0]).find('.card').length;
}

/**
 * Sends UNO shout to server, if necessary
 */
function sayUno()
{
    let ownCardCnt = getOwnCardCnt();
    if (ownCardCnt > types.UNO_MAX_CARD_CNT)
    {
        console.error("No point to say UNO with more than " + types.UNO_MAX_CARD_CNT + " cards");
        return;
    }
    // Pre-click UNO
    if (ownCardCnt === 2)
    {
        willSayUnoOnNextCard = true;
        $('#say-uno-' + socket.id).addClass("toggled");
    }
    else
    {
        $('#say-uno-' + socket.id).removeClass("toggled");
        socket.emit('say uno');
    }
}

/**
 * Sends report missed UNO of another client to the server
 * @param cid ID of the client who is suspected to have forgotten to say UNO
 */
function reportMissedUno(cid)
{
    if ($('#deck-cards' + cid).find('.card').length > 1)
    {
        console.error("Target player is not supposed to say UNO", cid);
        return;
    }
    socket.emit('report missed uno', cid);
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
        clientListDom.append($('<li>').text(client.name + ' (' + client.id + ')'));

        // Add deck for new clients
        let existingDom = $('#deck-name-' + client.id);
        if (existingDom.length === 0)
        {
            let newDeck = $(createDeck(client));
            deckContainer.append(newDeck);
            newDeck.find('.say-uno-btn').click(function(evt)
            {
                sayUno();
            });
            newDeck.find('.uno-report-btn').click(function (evt)
            {
                reportMissedUno($(evt.target).data('cid'));
            });
        }

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

    clients = JSON.parse(JSON.stringify(newClientList));
}

/**
 * Handles a card pull event
 * @param cardPull
 */
function pullCard(cardPull)
{
    let cardElem = $(createCard(cardPull.card));
    $('#deck-cards-' + cardPull.cid).append(cardElem);
    cardElem.click(playCard);
}

/**
 * Requests to play a card from the server, if possible
 * TODO starter card plays
 * @param evt
 */
function playCard(evt)
{
    console.log('play card: ', evt);
    let domElem = $(evt.target);
    let chosenColor = null;
    if (! domElem.hasClass('card'))
    {
        if (domElem.hasClass('card-color-chooser'))
        {
            chosenColor = domElem.data('color');
        }
        let parents = domElem.parents('.card');
        if (parents.length === 0)
        {
            console.error('Cannot find parent card object of ', domElem);
            return;
        }
        domElem = $(parents[0]);
    }

    $('.card-overlay').remove();

    if (domElem.parents('.own-deck').length === 0)
    {
        console.error("Cannot play someone else's card");
        return;
    }
    let card = {color: domElem.data('color'), face: domElem.data('face')};
    let asyncPlay = false;
    if (currentPlayer.cid !== socket.id)
    {
        if (types.cardCanBeAsyncPlayedOn(card, lastPlayedCard))
        {
            asyncPlay = true;
        }
        else
        {
            console.error("Not current player and card cannot be async played: ", card, lastPlayedCard);
            return;
        }
    }
    if (! asyncPlay && ! types.cardCanBePlayedOn(card, lastPlayedCard))
    {
        console.error("Card cannot be played on top", card, lastPlayedCard);
        return;
    }

    // Handle black color chooser overlay
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

    // Handle 0 deck chooser overlay
    if (card.face === 0)
    {
        domElem.append(createDeckChooserOverlay());
        $('.deck:not(.own-deck)').append(createDeckChosantOverlay());
        $('.deck-chooser-overlay').click(function(evt) {
            let domElem = $(evt.target);
            let parents = domElem.parents('.deck');
            if (parents.length < 1)
            {
                console.error("Could not find parent deck of overlay", domElem);
                return;
            }
            let deckDom = $(parents[0]);
            $('.card-overlay').remove();
            card.cid = deckDom.data('cid');
            socket.emit('play card', card);
        });
        return;
    }

    cardPendingPlayed = domElem;

    if (willSayUnoOnNextCard)
    {
        socket.emit('say uno');
        willSayUnoOnNextCard = false;
        $('#say-uno-' + socket.id).removeClass("toggled");
    }
    socket.emit('play card', card);

}

$(function () {
    /**
     * New client list msg
     */
    socket.on('client list', function(clientList)
    {
        console.log('client list', clientList);
        setNewClientList(clientList);
    });

    /**
     * Someone pulled a card from the pull deck
     */
    socket.on('card pulled', function(cardPull)
    {
        console.log('card pulled', cardPull);
        pullCard(cardPull);
        --deckSize;
        $('#deckSize').text(deckSize);
        $('#deck-' + cardPull.cid).removeClass('said-uno');
    });

    /**
     * Game completely restarted
     */
    socket.on('game restarted', function()
    {
        console.log('game restarted');
        $('.card:not(#main-deck-card)').remove();
        $('#playedCards').empty();
        deckSize = types.CARD_CNT;
        $('#deckSize').text(deckSize);
    });

    /**
     * Current player changed (turn advanced) to given player as {cid}
     */
    socket.on('current player', function(client)
    {
        console.log('current player', client);
        currentPlayer = client;
        $('.deck').removeClass('current-player');
        $('#deck-' + client.cid).addClass('current-player');

        willSayUnoOnNextCard = false;
        $('#say-uno-' + socket.id).removeClass("toggled");

        let ownCardCnt = getOwnCardCnt();
        if (ownCardCnt === 1 || (ownCardCnt === 2 && currentPlayer.cid === socket.id))
        {
            $('#say-uno-' + socket.id).prop('disabled', false);
        }
        else
        {
            $('#say-uno-' + socket.id).prop('disabled', true);
        }
    });

    /**
     * Someone legally played a card from his/her deck. Given as {cid, card{color, face}}
     */
    socket.on('card played', function(event)
    {
        console.log('card played', event);
        let newCardDom = $(createCard(event.card));
        newCardDom.css('transform','rotate(' + Math.floor(Math.random() * 360) + 'deg) translate('+ Math.floor(Math.random() * 25) + 'px, '+ Math.floor(Math.random() * 25) + 'px)')
        		.children('.card').addClass('played-card');
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
     * Two clients swapped their decks
     */
    socket.on('deck swap', function(data)
    {
        console.log('deck swap', data);
        $('#deck-cards-' + data.deck1.cid).empty();
        $('#deck-cards-' + data.deck2.cid).empty();
        data.deck1.deck.forEach(card => pullCard({cid: data.deck1.cid, card: card}));
        data.deck2.deck.forEach(card => pullCard({cid: data.deck2.cid, card: card}));
    });

    /**
     * A client has validly said UNO
     */
    socket.on('said uno', function(cid)
    {
        console.log('said uno', cid);
        log(getNameOfClient(cid) + " azt mondta UNO!");
        $('#deck-' + cid).addClass('said-uno');
    });

    /**
     * Response from the server when reported someone missing UNO, but (s)he did say before
     */
    socket.on('already said uno', function(cid)
    {
        console.log('already said uno', cid);
        log(getNameOfClient(cid) + " már mondta, hogy UNO!");
    });

    /**
     * A player just ran out of cards, but can be called back for a turn
     */
    socket.on('player callbackable', function(cid)
    {
        console.log('player callbackable', cid);
        log(getNameOfClient(cid) + " kifogyott a lapokból, de még visszahívható!");
    });

    /**
     * A player is permanently out
     */
    socket.on('player out', function(cid)
    {
        console.log('player out', cid);
        log(getNameOfClient(cid) + " kiment!");
    });

    /**
     * Pull deck has been reshuffled from the previously played cards
     */
    socket.on('deck reshuffled', function()
    {
        let previouslyPlayedCards = $('#playedCards').children().not(':last');
        deckSize = previouslyPlayedCards.length;
        $('#deckSize').text(deckSize);
        previouslyPlayedCards.remove();
    });

    /**
     * Someone successfully realized somebody else forgot to say UNO
     */
    socket.on('missed uno busted', function (bustData)
    {
        console.log('missed uno busted', bustData);
        log(getNameOfClient(bustData.buster) + " észrevette, hogy " + getNameOfClient(bustData.busted) + " nem mondta, hogy UNO!");
    });

    /**
     * Log message from the server to be displayed
     */
    socket.on('log', function(msg)
    {
        log(msg);
    });

    $('#deckSize').text(deckSize);

    $('#mainDeck').click(function(evt)
    {
        console.log('draw card');
        if (currentPlayer.cid !== socket.id) return;
        socket.emit('draw card');
    });

    msgBox = $('#msgBox');
});