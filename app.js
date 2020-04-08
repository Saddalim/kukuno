var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var types = require('./public/types.js');

var clients = [];

const missedUnoCardCnt = 3;

const secretCard = {color: types.COLOR.SECRET, face: types.FACE.SECRET};
const blankGameState = {
    currentPlayerIdx: null,
    players: {},
    deck: [],
    playedCards: [],
    turnDirection: 1,
    currentCardPullCnt: 0
};
const blankPlayerState = {
    state: types.PLAYER_STATE.PLAYING,
    deck: []
};

var gameState = blankGameState;

const defaultNamePrefix = "";
const defaultNames = ["Vőféjkecske", "Holland Gáti Varánusz", "Kacsacsőrű Emlős", "Galléros Császárlégykapó", "Zanzibári Hómuflon", "Dél-argentin Zuzmóokapi", "Csíkostökű Sáskarák", "Mexikói Óriáscthulhu", "Elefántcsontparti Háromfaszú Nyúlantilop", "Arizonai Péniszkobra", "Kaliforniai Vérhörcsög", "Üzbég Savköpő Menyét", "Irreverzibilis Vérpókmalac", "Rekurzív Medvedisznóember", "Észak-oszét Sivatagi Varangy", "Sárgapöttyös Jávorbölény"];

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
            break;
        }
    }
    client = clients.splice(i, 1);
    if (gameState.currentPlayerIdx === i) advanceTurn();
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
    if (! gameState.players.hasOwnProperty(cid)) return false;
    gameState.players[cid].deck.push(card);
    return true;
}

/**
 * Pulls a card from the deck to the given player's deck, and broadcasts the event to all clients
 * @param cid ID of the client the card shall go to
 */
function pullAndAddCardToClient(cid)
{
    let card = popNextFromDeck();
    addCardToClient(card, cid);
    hideAndEmitCardPull({cid: cid, card: card}, clients);
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
 * Swaps the decks of the two given players and emits the necessary events
 * @param {number} cid1
 * @param {number} cid2
 */
function handleDeckSwap(cid1, cid2)
{
    console.log('Swapping decks of ' + cid1 + " and " + cid2);
    let temp = gameState.players[cid1].deck;
    gameState.players[cid1].deck = gameState.players[cid2].deck;
    gameState.players[cid2].deck = temp;

    // Swapping decks discards UNOs said earlier!
    gameState.players[cid1].state = types.PLAYER_STATE.PLAYING;
    gameState.players[cid2].state = types.PLAYER_STATE.PLAYING;

    hideAndEmitDeckSwap({deck1: {cid: cid1, deck: gameState.players[cid1].deck}, deck2: {cid: cid2, deck: gameState.players[cid2].deck}}, clients);
}

/**
 * Completely discards current game state, and starts a new
 */
function restartGame()
{
    if (clients.length < 1) return;

    console.log('Signalling restarted');
    io.emit('game restarted');

    gameState = JSON.parse(JSON.stringify(blankGameState));
    clients.forEach(client => gameState.players[client.id] = JSON.parse(JSON.stringify(blankPlayerState)));

    console.log('Filling deck');
    fillDeck();
    if (gameState.deck.length !== types.CARD_CNT)
    {
        console.error("Incorrect deck size: " + gameState.deck.length + " vs " + types.CARD_CNT);
    }

    console.log('Distributing cards');

    var startCardCnt = 4 + Math.floor(Math.random() * 4);  //from 4 to 7
    console.log('Starting card count is ' + startCardCnt);
    
    for (var i = 0; i < startCardCnt; ++i)
    {
        clients.forEach(client => {
            let card = popNextFromDeck();
            gameState.players[client.id].deck.push(card);
            hideAndEmitCardPull({cid: client.id, card: card}, clients);
        });
    }

    for (let [cid, player] of Object.entries(gameState.players))
    {
        console.log(getNameOfClient(cid) + "(" + cid + ")'s deck: " + types.deckToString(player.deck));
    }

    // Starter card
    for(let starterCard = gameState.deck[0]; ! types.canBeStarterCard(starterCard); )
    {
        console.log(types.cardToString(starterCard) + " is not a valid starter card, rotating...");
        gameState.deck.push(gameState.deck.splice(0, 1));
        starterCard = gameState.deck[0];
    }
    gameState.playedCards.push(popNextFromDeck());
    io.emit('card played', {cid: null, card: getTopPlayedCard()});

    // Starting player
    gameState.currentPlayerIdx = Math.floor(Math.random() * clients.length);
    io.emit('current player', {cid: clients[gameState.currentPlayerIdx].id});

    console.log('Ready with new game');
}

/**
 * Step onto the next player, and emit event to all clients
 */
function advanceTurn(depth = 0)
{
    if (depth > Object.keys(gameState.players).filter(cid => gameState.players[cid].state !== types.PLAYER_STATE.OUT).length)
    {
        io.emit('end game');
        return;
    }

    if (depth === 0)
    {
        console.log("Advance turn, curr idx: " + gameState.currentPlayerIdx + ", direction: ", gameState.turnDirection);
    }

    if (gameState.currentPlayerIdx === null && clients.length > 0) gameState.currentPlayerIdx = 0;
    else
    {
        gameState.currentPlayerIdx += gameState.turnDirection;
        if (gameState.currentPlayerIdx >= clients.length) gameState.currentPlayerIdx = 0;
        if (gameState.currentPlayerIdx < 0) gameState.currentPlayerIdx = clients.length - 1;
    }

    let candidateClientId = clients[gameState.currentPlayerIdx].id;

    // Skip clients that are not players (late joiners)
    if (! gameState.players.hasOwnProperty(candidateClientId))
    {
        console.log("Advancing more, client is not a player", gameState.currentPlayerIdx, candidateClientId);
        advanceTurn(depth + 1);
    }
    else
    {
        // Skip players that are already out
        let playerData = gameState.players[candidateClientId];
        if (playerData.state === types.PLAYER_STATE.OUT)
        {
            console.log("Advancing more, player is already out", candidateClientId, gameState.players[candidateClientId]);
            advanceTurn(depth + 1);
        }
        // Make players in callbackable states to go out
        else if (gameState.currentCardPullCnt === 0 && (playerData.state === types.PLAYER_STATE.CALLBACKABLE || playerData.state === types.PLAYER_STATE.CALLBACKABLE_SAID_UNO))
        {
            playerData.state = types.PLAYER_STATE.OUT;
            console.log(getNameOfClient(candidateClientId) + " (" + candidateClientId + ") is out!");
            io.emit('player out', candidateClientId);
            advanceTurn(depth + 1);
        }
        else
        {
            io.emit('current player', {cid: candidateClientId});
        }
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
    console.log((isAdmin ? 'an admin' : 'a user') + ' has connected');

    /**
     * Disconnect event
     */
    socket.on('disconnect', function()
    {
        console.log('user has disconnected');
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
        if (clients[gameState.currentPlayerIdx].id !== socket.id)
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
        if (! gameState.players.hasOwnProperty(socket.id))
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
        let cardIdx = getPlayableCardIdxFromDeck(cardToPlay, gameState.players[socket.id].deck);
        if (cardIdx === -1)
        {
            console.log('But (s)he has no such card :( Available: ' + types.deckToString(gameState.players[socket.id].deck));
            return;
        }

        let card = gameState.players[socket.id].deck[cardIdx];

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
            while (gameState.currentPlayerIdx !== playerIdx) advanceTurn();
        }

        if (card.face === 0)
        {
            if (gameState.players[socket.id].deck.length === 1)
            {
                // Swap card as last
                console.log(getNameOfClient(socket.id) + ' wants ' + getNameOfClient(cardToPlay.cid1) + " and " + getNameOfClient(cardToPlay.cid2) + " to change");
                if (! types.canBeTargetOfSwap(gameState.players[cardToPlay.cid1].state)
                    || ! types.canBeTargetOfSwap(gameState.players[cardToPlay.cid2].state))
                {
                    console.log("But this is only possible between players still in play; " + getNameOfClient(cardToPlay.cid1) + " is " + types.playerStateToString(gameState.players[cardToPlay.cid1].state) + " (" + gameState.players[cardToPlay.cid1].state + "), " + getNameOfClient(cardToPlay.cid2) + " is " + types.playerStateToString(gameState.players[cardToPlay.cid2].state) + "(" + gameState.players[cardToPlay.cid2].state + ")");
                    return;
                }
            }
            else
            {
                // Normal swap card
                console.log(getNameOfClient(socket.id) + ' wants to change decks with ' + getNameOfClient(cardToPlay.cid));
                if (! types.canBeTargetOfSwap(gameState.players[socket.id].state)
                    || ! types.canBeTargetOfSwap(gameState.players[cardToPlay.cid].state))
                {
                    console.log("But this is only possible between players still in play; " + getNameOfClient(socket.id) + " is " + types.playerStateToString(gameState.players[socket.id].state) + " (" + gameState.players[socket.id].state + "), " + getNameOfClient(cardToPlay.cid) + " is " + types.playerStateToString(gameState.players[cardToPlay.cid].state) + "(" + gameState.players[cardToPlay.cid].state + ")");
                    return;
                }
            }

        }

        console.log('And (s)he can!' + (asyncPlay ? ' Async play!' : ''));

        gameState.players[socket.id].deck.splice(cardIdx, 1);
        gameState.playedCards.push(card);

        // Check for special cards
        switch (card.face)
        {
            case types.FACE.TURNAROUND:
                gameState.turnDirection *= -1;
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
            if (gameState.players[socket.id].deck.length === 0)
            {
                // Swap card as last
                handleDeckSwap(cardToPlay.cid1, cardToPlay.cid2);
            }
            else
            {
                // Normal swap card
                handleDeckSwap(socket.id, cardToPlay.cid);
            }
        }

        // Check for out of cards (set callbackable state)
        console.log(getNameOfClient(socket.id) + " (" + socket.id + ") has " + gameState.players[socket.id].deck.length + " cards left");
        if ( gameState.players[socket.id].deck.length === 0)
        {
            gameState.players[socket.id].state = (gameState.players[socket.id].state === types.PLAYER_STATE.SAID_UNO ? types.PLAYER_STATE.CALLBACKABLE_SAID_UNO : types.PLAYER_STATE.CALLBACKABLE);
            io.emit('player callbackable', socket.id);
        }

        advanceTurn();
    });

    /**
     * A client tries to draw a card from the pull deck
     */
    socket.on('draw card', function() {
        console.log(getNameOfClient(socket.id) + " (" + socket.id + ') tries to draw a card');
        if (clients[gameState.currentPlayerIdx].id !== socket.id)
        {
            console.log("But (s)he's not the current player!");
            return;
        }
        if (! gameState.players.hasOwnProperty(socket.id))
        {
            console.log("But (s)he doesn't have a deck");
            return;
        }

        // Drawing a card discards said UNO
        gameState.players[socket.id].state = types.PLAYER_STATE.PLAYING;

        let pullCardCnt = Math.max(1, gameState.currentCardPullCnt);
        console.log('And (s)he can and pulls ' + pullCardCnt + ' card(s)');

        // Player decides to pull after plus cards
        for (var i = 0; i < pullCardCnt; ++i)
        {
            pullAndAddCardToClient(socket.id);
        }
        gameState.currentCardPullCnt = 0;

        // Reshuffle deck if empty
        if (gameState.deck.length === 0)
        {
            let cards = gameState.playedCards.splice(0, gameState.playedCards.length - 1);
            // Cannot simply put back, black cards need to be renewed as black :)
            cards.forEach(card => {if (card.face === types.FACE.PLUS4 || card.face === types.FACE.COLORSWITCH) card.color = types.COLOR.BLACK});
            gameState.deck = cards;
            shuffle(gameState.deck);
            io.emit('deck reshuffled');
        }

        advanceTurn();
    });

    socket.on('say uno', function()
    {
        console.log(getNameOfClient(socket.id) + " (" + socket.id + ") tries to say uno");
        if (! gameState.players.hasOwnProperty(socket.id))
        {
            console.log("But doesn't have a deck");
            return;
        }
        let playerData = gameState.players[socket.id];
        if (playerData.deck.length > types.UNO_MAX_CARD_CNT)
        {
            console.log("But has more than " + types.UNO_MAX_CARD_CNT + " card(s)");
            return;
        }
        if (playerData.state === types.PLAYER_STATE.SAID_UNO || playerData.state === types.PLAYER_STATE.CALLBACKABLE_SAID_UNO)
        {
            console.log("But has already said UNO");
            return;
        }
        if (playerData.state === types.PLAYER_STATE.OUT)
        {
            console.log("But player is already out");
            return;
        }

        console.log("And (s)he can!");

        if (playerData.state === types.PLAYER_STATE.PLAYING) playerData.state = types.PLAYER_STATE.SAID_UNO;
        else if (playerData.state === types.PLAYER_STATE.CALLBACKABLE) playerData.state = types.PLAYER_STATE.CALLBACKABLE_SAID_UNO;
        io.emit('said uno', socket.id);
    });

    /**
     * A client tries to report that a player has forgot to say UNO
     */
    socket.on('report missed uno', function(reportedCid)
    {
        console.log(getNameOfClient(socket.id) + " (" + socket.id + ") tries to report that " + getNameOfClient(reportedCid) + " (" + reportedCid + ") has forgot to say UNO");
        if (!gameState.players.hasOwnProperty(reportedCid))
        {
            console.log("But target player doesn't have a deck");
            return;
        }
        if (gameState.players[reportedCid].state === types.PLAYER_STATE.OUT)
        {
            console.log("But target player is already out");
            return;
        }
        if (gameState.players[reportedCid].deck.length > 1)
        {
            console.log("But target deck has more than 1 card");
            return;
        }
        if (gameState.players[reportedCid].state === types.PLAYER_STATE.SAID_UNO || gameState.players[reportedCid].state === types.PLAYER_STATE.CALLBACKABLE_SAID_UNO)
        {
            console.log("But target player has already said UNO");
            io.to(socket.id).emit('already said uno', reportedCid);
            return;
        }

        console.log("And (s)he is right! Punishment awaits " + getNameOfClient(reportedCid) + " (" + reportedCid + ")");
        io.emit('missed uno busted', {busted: reportedCid, buster: socket.id});

        gameState.players[reportedCid].state = types.PLAYER_STATE.PLAYING;
        for (let i = 0; i < missedUnoCardCnt; ++i)
        {
            pullAndAddCardToClient(reportedCid);
        }
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
        var client = {id: socket.id, name: "???", socket: socket};
        clients.push(client);
        io.emit('client list', getPublishableClientList());

        // Publish actual game state to new client
        for (let [cid, player] of Object.entries(gameState.players))
        {
            player.deck.forEach(card => hideAndEmitCardPull({cid: cid, card: card}, [{id: socket.id, socket: socket}]));
        }

        if (gameState.currentPlayerIdx !== null)
        {
            io.to(socket.id).emit('current player', {cid: clients[gameState.currentPlayerIdx].id});
        }

        // TODO assign random name at the first place
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
