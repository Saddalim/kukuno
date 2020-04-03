var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var types = require('./public/types.js');

var clients = [];
var gameState = {
    nextPlayerIdx: null,
    decks: {},
    deck: [],
    playedCards: [],
    turnDirection: 1
};

const cardCnt = 7;
const secretCard = {color: types.COLOR.SECRET, face: types.FACE.SECRET};

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
 * @returns {*} The next (top) card that is now not part of the pull deck
 */
function popNextFromDeck()
{
    var card = gameState.deck[0];
    gameState.deck.splice(0, 1);
    return card;
}

/**
 * Emits a card pull event to all clients, effectively hiding card data for clients not the target of the pull action.
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

    gameState = {
        nextPlayerIdx: null,
        decks: {},
        deck: [],
        playedCards: [],
        turnDirection: 1
    };
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
    io.emit('card played', {cid: null, card: gameState.playedCards[0]});

    console.log('Ready with new game');

    advanceTurn();
}

/**
 * Step onto the next player, and emit event to all clients
 */
function advanceTurn()
{
    if (gameState.nextPlayerIdx === null && clients.length > 0) gameState.nextPlayerIdx = 0;
    else
    {
        ++gameState.nextPlayerIdx;
        if (gameState.nextPlayerIdx >= clients.length) gameState.nextPlayerIdx = 0;
    }

    io.emit('current player', {cid: clients[gameState.nextPlayerIdx].id});
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
                if (types.hasChoosableColor(card) && types.hasChoosableColor(cardInDeck))
                {
                    return true;
                }
                return card.face === cardInDeck.face
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
     * TODO async card plays, starter card plays
     */
    socket.on('play card', function(cardToPlay) {
        console.log(cardToPlay);
        console.log('(' + socket.id + ') tries to play: ' + types.cardToString(cardToPlay));
        if (clients[gameState.nextPlayerIdx].id !== socket.id) return;
        if (! gameState.decks.hasOwnProperty(socket.id)) return;
        let cardIdx = getPlayableCardIdxFromDeck(cardToPlay, gameState.decks[socket.id]);
        if (cardIdx === -1) return;
        if (! types.cardCanBePlayedOn(cardToPlay, gameState.playedCards[gameState.playedCards.length - 1])) return;
        console.log('And (s)he can!');
        let card = gameState.decks[socket.id][cardIdx];
        if (types.hasChoosableColor(card))
        {
            card.color = cardToPlay.color;
        }
        gameState.decks[socket.id].splice(cardIdx, 1);
        gameState.playedCards.push(card);
        io.emit('card played', {cid: socket.id, card: card});
        advanceTurn();
    });

    /**
     * A client tries to draw a card from the pull deck
     * TODO pull more than 1 card if a plus chain is ended this way
     */
    socket.on('draw card', function() {
        console.log(socket.id + ' tries to draw a card');
        if (clients[gameState.nextPlayerIdx].id !== socket.id) return;
        if (! gameState.decks.hasOwnProperty(socket.id)) return;
        let card = popNextFromDeck();
        hideAndEmitCardPull({cid: socket.id, card: card}, clients);
        console.log('And (s)he can!');
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
