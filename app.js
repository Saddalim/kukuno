var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var types = require('./public/types.js');

var clients = [];

const cardCnt = 7;
const secretCard = {color: types.COLOR.SECRET, face: types.FACE.SECRET};
const blankGameState = {
    nextPlayerIdx: null,
    decks: {},
    deck: [],
    playedCards: [],
    turnDirection: 1,
    currentCardPullCnt: 0
};

var gameState = blankGameState;

const defaultNamePrefix = "";
const defaultNames = ["Vőféjkecske", "Holland Gáti Varánusz", "Kacsacsőrű Emlős", "Galléros Császárlégykapó", "Zanzibári Hómuflon", "Dél-argentin Zuzmóokapi", "Csíkostökű Sáskarák", "Mexikói Óriáscthulhu", "Elefántcsontparti Háromfaszú Nyúlantilop", "Arizoniai Péniszkobra", "Kaliforniai Vérhörcsög", "Üzbég Savköpő Menyét", "Irreverzibilis Vérpókmalac", "Rekurzív Medvedisznóember"];

/**
 * Shuffles the given array, effectively modifying it (not copying!)
 * @param array Array to be shuffled
 * @returns {*} The shuffled array
 */
var shuffle = function (array) {

    var currentIndex = array.length;
    var temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;

};

/**
 * Generates a random, yet untaken name
 * @returns {string} The name
 */
function getRandomName()
{
    if (clients.length >= defaultNames.length) return "???";
    while (true)
    {
        let nameToBe = defaultNamePrefix + defaultNames[Math.floor(Math.random() * defaultNames.length)];
        if (clients.findIndex(client => client.name === nameToBe) === -1) return nameToBe;
    }
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
 * Gets the index of the client with the given ID
 * @param cid
 * @returns {number} The index, if client is known, -1 otherwise
 */
function getIdxOfClient(cid)
{
    for (let clientIdx = 0; clientIdx < clients.length; ++clientIdx)
    {
        if (clients[clientIdx].id === cid) return clientIdx;
    }
    return -1;
}

/**
 * Renames the given client. Does not send update to clients!
 * @param id ID of the client
 * @param name New name of the client
 * @returns {boolean} True, if client ID is known
 */
function renameClient(id, name)
{
    for (var i = 0; i < clients.length; ++i)
    {
        if (clients[i].id === id)
        {
            clients[i].name = name;
            return true;
        }
    }
    return false;
}

/**
 * Finds a client and returns its object
 * @param id ID of the client to look for
 * @returns {null|*} The client, or null if not found
 */
function getClientWithId(id)
{
    for (var i = 0; i < clients.length; ++i)
    {
        if (clients[i].id === id) return clients[i];
    }
    return null;
}

/**
 * Remove a given client from the known clients. Does not send update to clients!
 * @param id ID of the client to be disconnected
 * @returns {null}
 */
function disconnectClientWithId(id)
{
    var i = 0;
    var client = null;
    for (; i < clients.length; ++i)
    {
        if (clients[i].id === id)
        {
            clients[i].connected = false;
            client = clients[i];
            break;
        }
    }
    clients.splice(i, 1);
    return client;
}

/**
 * Empties and fills up the pull deck with ALL available cards in a random order.
 */
function fillDeck()
{
    gameState.deck = [];
    for (var color = 0; color < 4; ++color)
    {
        // 1 zero per color
        gameState.deck.push({color: color, face: 0});

        // 2 of each per color
        for (var i = 0; i < 2; ++i)
        {
            for (var number = 1; number <= 9; ++number)
            {
                gameState.deck.push({color: color, face: number});
            }

            gameState.deck.push({color: color, face: types.FACE.PLUS2});
            gameState.deck.push({color: color, face: types.FACE.DENY});
            gameState.deck.push({color: color, face: types.FACE.TURNAROUND});
        }
    }

    for (var i = 0; i < 4; ++i)
    {
        gameState.deck.push({color: types.COLOR.BLACK, face: types.FACE.COLORSWITCH});
        gameState.deck.push({color: types.COLOR.BLACK, face: types.FACE.PLUS4});
    }

    shuffle(gameState.deck);
    console.log("Deck filled with " + gameState.deck.length + " cards");
}

/**
 * Removes and returns a random card from the pull deck
 * TODO reshuffle played cards if pull deck is empty
 * @returns {*} The random card that is now not part of the pull deck
 */
function popRandomFromDeck()
{
    const randomId = Math.floor(Math.random() * gameState.deck.length);
    var card = gameState.deck[randomId];
    gameState.deck.splice(randomId, 1);
    return card;
}

/**
 * Removes and returns the next (top) card from the pull deck
 * TODO reshuffle played cards if pull deck is empty
 * @returns {*} The next (top) card that is now not part of the pull deck
 */
function popNextFromDeck()
{
    var card = gameState.deck[0];
    gameState.deck.splice(0, 1);
    return card;
}

/**
 * Gets the last played card (that is on the top of the table)
 * @returns {null|*} Null, if no cards on the played deck
 */
function getTopPlayedCard()
{
    if (gameState.playedCards.length === 0) return null;
    return gameState.playedCards[gameState.playedCards.length - 1];
}

/**
 * Emits a card pull event to all clients, effectively hiding card data from clients not the target of the pull action.
 * @param cardPull Cardpull object, expecting a cid as the card recipient's ID, and a card{color, face} as the card
 * @param recipients Array of clients the event shall be sent to.
 */
function hideAndEmitCardPull(cardPull, recipients)
{
    recipients.forEach(client => {
        io.to(client.socket.id).emit('card pulled', {cid: cardPull.cid, card: (cardPull.cid === client.id ? cardPull.card : secretCard)});
    });
}

/**
 * Emits a deck swap event to all clients, effectively hiding card data from other clients
 * @param deckSwap DeckSwap object, expecting deck1 and deck2, each a {cid, [card{color, face}]} object
 * @param recipients Array of clients the event shall be sent to.
 */
function hideAndEmitDeckSwap(deckSwap, recipients)
{
    recipients.forEach(client => {
        let actDeckSwap = JSON.parse(JSON.stringify(deckSwap)); // deep copy JS-style, fkyeah :)
        if (client.socket.id !== actDeckSwap.deck1.cid)
        {
            console.log("Hiding swap deck 1 of " + actDeckSwap.deck1.cid + " from " + client.socket.id);
            actDeckSwap.deck1.deck = Array(deckSwap.deck1.deck.length).fill({color: types.COLOR.SECRET, face: types.FACE.SECRET});
        }
        if (client.socket.id !== actDeckSwap.deck2.cid)
        {
            console.log("Hiding swap deck 2 of " + actDeckSwap.deck2.cid + " from " + client.socket.id);
            actDeckSwap.deck2.deck = Array(deckSwap.deck2.deck.length).fill({color: types.COLOR.SECRET, face: types.FACE.SECRET});
        }
        io.to(client.socket.id).emit('deck swap', actDeckSwap);
    });
}

/**
 * Adds the given card to the given client's deck, if that client exists.
 * @param card The card to be given
 * @param cid The ID of the client to whom it shall be added
 * @returns {boolean} False, if client is unknown or doesn't have a deck
 */
function addCardToClient(card, cid)
{
    if (! gameState.decks.hasOwnProperty(cid)) return false;
    gameState.decks[cid].push(card);
    return true;
}

/**
 * Returns a copy of the array of active client data, from which sensitive data has been removed
 * @returns {{name: *, id: *}[]}
 */
function getPublishableClientList()
{
    return clients.map(client => ({id: client.id, name: client.name}));
}

/**
 * Completely discards current game state, and starts a new
 */
function restartGame()
{
    if (clients.length < 1) return;

    console.log('Signalling restarted');
    io.emit('game restarted');

    gameState = blankGameState;
    clients.forEach(client => gameState.decks[client.id] = []);

    console.log('Filling deck');
    fillDeck();

    console.log('Distributing cards');

    for (var i = 0; i < cardCnt; ++i)
    {
        clients.forEach(client => {
            let card = popNextFromDeck();
            gameState.decks[client.id].push(card);
            hideAndEmitCardPull({cid: client.id, card: card}, clients);
        });
    }

    gameState.playedCards.push(popNextFromDeck());
    io.emit('card played', {cid: null, card: getTopPlayedCard()});

    gameState.nextPlayerIdx = Math.floor(Math.random() * clients.length);
    io.emit('current player', {cid: clients[gameState.nextPlayerIdx].id});
    console.log('Ready with new game');
}

/**
 * Step onto the next player, and emit event to all clients
 */
function advanceTurn(depth = 0)
{
    if (depth === gameState.decks.length)
    {
        // TODO end game
        return;
    }

    if (gameState.nextPlayerIdx === null && clients.length > 0) gameState.nextPlayerIdx = 0;
    else
    {
        gameState.nextPlayerIdx += gameState.turnDirection;
        if (gameState.nextPlayerIdx >= clients.length) gameState.nextPlayerIdx = 0;
        if (gameState.nextPlayerIdx < 0) gameState.nextPlayerIdx = clients.length;
    }

    // Skip players with no cards remaining
    if (gameState.decks[clients[gameState.nextPlayerIdx].id].length === 0)
    {
        advanceTurn(depth + 1);
    }
    else
    {
        io.emit('current player', {cid: clients[gameState.nextPlayerIdx].id});
    }
}

/**
 * Finds whether the given card can be played from the given deck.
 * If the same card exists more than once in the given deck, chooses the first
 * Allows originally black card to be played as colored, in this case it removes the back card from the deck.
 * @param card The card to look for
 * @param deck The deck in which the card shall be looked for
 * @returns {number | *} Index of the card in the deck. -1, if not found.
 */
function getPlayableCardIdxFromDeck(card, deck)
{
    return deck.findIndex(
        cardInDeck => {
            if (card.face === cardInDeck.face)
            {
                // Black check necessary to filter if a black card is wanted to be played without coloring
                if (card.color !== types.COLOR.BLACK && types.hasChoosableColor(cardInDeck))
                {
                    return true;
                }
                return card.color === cardInDeck.color;
            }
        });
}

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res)
{
    res.sendFile(__dirname + '/index.html');
});

app.get('/admin', function(req, res)
{
    res.sendFile(__dirname + '/admin.html');
});

io.on('connection', function(socket)
{
    let isAdmin = socket.handshake.headers.referer.includes("/admin");
    console.log((isAdmin ? 'an admin connected' : 'a user connected'));

    /**
     * Disconnect event
     */
    socket.on('disconnect', function()
    {
        console.log('user disconnected');
        var client = disconnectClientWithId(socket.id);
        if (client != null)
        {
            io.emit('client list', getPublishableClientList());
        }
    });

    /**
     * 'Rename myself' event from a client
     */
    socket.on('client rename', function(name)
    {
        console.log('Client rename: ' + name);
        if (renameClient(socket.id, name))
        {
            console.log('Advertising client rename');
            io.emit('client list', getPublishableClientList());
        }
    });

    /**
     * A client tries to play a card given as {color, face}
     * TODO starter card plays
     */
    socket.on('play card', function(cardToPlay) {

        console.log(getNameOfClient(socket.id) + ' (' + socket.id + ') tries to play: ' + types.cardToString(cardToPlay));
        let lastPlayedCard = getTopPlayedCard();
        let asyncPlay = false;
        if (clients[gameState.nextPlayerIdx].id !== socket.id)
        {
            if (types.cardCanBeAsyncPlayedOn(cardToPlay, getTopPlayedCard()))
            {
                asyncPlay = true;
            }
            else
            {
                console.log('But (s)he is not the current player or card cannot be async played :(');
                return;
            }

        }
        if (! gameState.decks.hasOwnProperty(socket.id))
        {
            console.log('But (s)he does not have a deck :(');
            return;
        }
        if (! asyncPlay && ! types.cardCanBePlayedOn(cardToPlay, lastPlayedCard))
        {
            console.log('But the chosen card (' + types.cardToString(cardToPlay) + ') cannot be played on top of ' + types.cardToString(lastPlayedCard));
            return;
        }
        if (gameState.currentCardPullCnt > 0 && cardToPlay.face !== types.FACE.PLUS2 && cardToPlay.face !== types.FACE.PLUS4)
        {
            console.log('But there are plus cards (' + gameState.currentCardPullCnt + ') waiting to be pulled');
            return;
        }
        let cardIdx = getPlayableCardIdxFromDeck(cardToPlay, gameState.decks[socket.id]);
        if (cardIdx === -1)
        {
            console.log('But (s)he has no such card :( Available: ' + types.deckToString(gameState.decks[socket.id]));
            return;
        }

        let card = gameState.decks[socket.id][cardIdx];

        if (types.hasChoosableColor(card))
        {
            console.log('This is a special ' + types.cardToString(card) + ' colored as ' + types.colorToString(cardToPlay.color));
            card.color = cardToPlay.color;
        }

        if (asyncPlay)
        {
            let playerIdx = getIdxOfClient(socket.id);
            if (playerIdx === -1)
            {
                console.log('But this client idx (' + playerIdx + ') is unknown');
                return;
            }

            // Iterate so that callbacks will be handled
            while (gameState.nextPlayerIdx !== playerIdx) advanceTurn();
        }

        console.log('And (s)he can!' + (asyncPlay ? ' Async play!' : ''));

        gameState.decks[socket.id].splice(cardIdx, 1);
        gameState.playedCards.push(card);

        // Check for special cards
        switch (card.face)
        {
            case types.FACE.TURNAROUND:
                gameState.nextPlayerIdx *= -1;
                break;
            case types.FACE.PLUS2:
                gameState.currentCardPullCnt += 2;
                break;
            case types.FACE.PLUS4:
                gameState.currentCardPullCnt += 4;
                break;
            case types.FACE.DENY:
                advanceTurn();
                break;
        }

        io.emit('card played', {cid: socket.id, card: card});

        // Emit the swap event after card play event, so it is clear who played the 0 and from which deck
        if (card.face === 0)
        {
            console.log(getNameOfClient(socket.id) + ' wants to change decks with ' + getNameOfClient(cardToPlay.cid));
            let temp = gameState.decks[socket.id];
            gameState.decks[socket.id] = gameState.decks[cardToPlay.cid];
            gameState.decks[cardToPlay.cid] = temp;
            hideAndEmitDeckSwap({deck1: {cid: socket.id, deck: gameState.decks[socket.id]}, deck2: {cid: cardToPlay.cid, deck: gameState.decks[cardToPlay.cid]}}, clients);
        }

        advanceTurn();
    });

    /**
     * A client tries to draw a card from the pull deck
     */
    socket.on('draw card', function() {
        console.log(socket.id + ' tries to draw a card');
        if (clients[gameState.nextPlayerIdx].id !== socket.id) return;
        if (! gameState.decks.hasOwnProperty(socket.id)) return;

        let pullCardCnt = Math.max(1, gameState.currentCardPullCnt);
        console.log('And (s)he can and pulls ' + pullCardCnt + ' cards');

        // Player decides to pull after plus cards
        for (var i = 0; i < pullCardCnt; ++i)
        {
            let card = popNextFromDeck();
            addCardToClient(card, socket.id);
            hideAndEmitCardPull({cid: socket.id, card: card}, clients);
        }
        gameState.currentCardPullCnt = 0;

        advanceTurn();
    });

    if (isAdmin)
    {
        socket.on('game restart', function() {
            console.log('Game restart');
            restartGame();
        });
    }
    else
    {
        var client = {id: socket.id, name: "???", socket: socket, connected: true};
        clients.push(client);
        io.emit('client list', getPublishableClientList());

        // Publish actual game state to new client
        for (let [cid, deck] of Object.entries(gameState.decks))
        {
            deck.forEach(card => hideAndEmitCardPull({cid: cid, card: card}, [{id: socket.id, socket: socket}]));
        }

        if (gameState.nextPlayerIdx !== null)
        {
            io.to(socket.id).emit('current player', {cid: clients[gameState.nextPlayerIdx].id});
        }

        if (renameClient(socket.id, getRandomName()))
        {
            console.log('Advertising client rename');
            io.emit('client list', getPublishableClientList());
        }

    }
});

http.listen(3000, function()
{
    console.log('listening on *:3000');
});
