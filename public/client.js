var socket = io({type: 'client'});
var deckSize = 0;
var currentPlayer = {cid: null};
var cardPendingPlayed = null; // card to be played, saved while a color
								// selection overlay is displayed over black
								// cards
var lastPlayedCard = null; // card last played, on top of the played cards
var willSayUnoOnNextCard = false; // true if the player pre-selected uno to
									// send the 'say uno' event along with the
									// played card
var firstZeroTargetCid = null; // contains the first target cid when 0 played
								// as last card and selecting the two opponents
								// to switch cards
var clients = [];
var msgBox = null;

function log(text)
{
    console.log("Log: ", text);
    if (msgBox.is(":visible"))
    {
        msgBox.html(msgBox.text() + '<hr>' + text);
    }
    else
    {
        msgBox.text(text);
    }

    msgBox.fadeIn(100).delay(1800).fadeOut(100);
}

/**
 * Gets the name of the client with the given ID TODO make it more efficient
 * 
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
 * 
 * @param client
 *            Client as {id, name}
 * @returns {string}
 */
function createDeck(client)
{
    console.log("createDeck", client.name);
    return '<div class="deck' + (client.id === socket.id ? ' own-deck' : '') + '" id="deck-' + client.id + '" data-cid="' + client.id + '"><div class="deck-container"><span id="deck-name-' + client.id + '" class="deck-name">' + client.name + ' (' + client.id + ')</span>' + (client.id === socket.id ? '<input type="text" id="ownName" value="' + client.name + '" onchange="changeName()">' : '') + ' - ' + (client.id === socket.id ? '<button class="say-uno-btn" id="say-uno-' + client.id + '" disabled>UNO!</button> <button class="sort-btn" id="sort-btn-' + client.id + '">Rendezzed mán!</button>' : '<a href="#" class="uno-report-btn" id="uno-report-' + client.id + '" data-cid="' + client.id + '">Nem mondta, hogy UNO!</a>') + '<div class="deck-cards" id="deck-cards-' + client.id + '"></div></div></div>';
}

/**
 * Creates a HTML DOM element string representing a color chooser overlay for
 * black cards
 * 
 * @returns {string}
 */
function createColorChooserOverlay()
{
    return '<div class="card-overlay card-color-chooser card-color-chooser-red" data-color="' + types.COLOR.RED + '"></div><div class="card-overlay card-color-chooser card-color-chooser-green" data-color="' + types.COLOR.GREEN + '"></div><div class="card-overlay card-color-chooser card-color-chooser-blue" data-color="' + types.COLOR.BLUE + '"></div><div class="card-overlay card-color-chooser card-color-chooser-yellow" data-color="' + types.COLOR.YELLOW + '"></div>';
}

/**
 * Creates a HTML DOM element string representing a deck chooser overlay for 0
 * cards
 * 
 * @returns {string}
 */
function createDeckChooserOverlay()
{
    return '<div class="card-overlay card-deck-chooser">' + (getOwnCardCnt() === 1 ? 'Kik?' : 'Kivel?') + '</div>';
}

/**
 * Creates a HTML DOM element string representing an overlay for decks when
 * choosing replacement deck with 0 card
 * 
 * @returns {string}
 */
function createDeckChosantOverlay()
{
    return '<div class="card-overlay deck-chooser-overlay"></div>';
}

/**
 * Creates a HTML DOM element string representing the given card
 * 
 * @param card
 *            Card given as {color, face}
 * @returns {string}
 */
function createCard(card)
{
    return '<div class="card card-' + (card.color === types.COLOR.SECRET ? 'secret' : types.colorToString(card.color).toLowerCase()) + ' card-' + (card.face === types.FACE.SECRET ? 'secret' : card.face) + '" data-color="' + card.color + '" data-face="' + card.face + '"><div class="card-inner"></div><div class="card-num card-face-center" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div><div class="card-num card-face-top" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div><div class="card-num card-face-bottom" data-face="' + types.faceToString(card.face).toLowerCase() + '">' + types.faceToSymbol(card.face) + '</div></div>';
}

/**
 * Gets the number of own cards
 * 
 * @returns {number}
 */
function getOwnCardCnt()
{
    return $($('.own-deck')[0]).find('.card').length;
}

/**
 * Sort my deck.
 */
function sortDeck()
{
	var toSort = $(".own-deck").find(".card");
	toSort.sort(function(a,b) {
		var acolor = $(a).data('color');
		var bcolor = $(b).data('color');	    
	    if (acolor > bcolor) return 1;
	    if (acolor < bcolor) return -1;
	    var aface =$(a).data('face');
	    var bface =$(b).data('face');
	    if (aface > bface) return 1;
	    return -1;
	});
	console.log(toSort);
	toSort.detach().prependTo($(".own-deck").find(".deck-cards"));
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
    	var hasValidCardToPlay= false;
    	$('#deck-cards-' + currentPlayer.cid).children('.card').each ( function(index, card) {		
    		let cardObj = {color: $(card).data('color'), face: $(card).data('face')};	
    		hasValidCardToPlay = hasValidCardToPlay  || types.cardCanBePlayedOn(cardObj, lastPlayedCard);
    	});
    	if (!hasValidCardToPlay) 
    	{
    		console.log("No point to say UNO with two cards if you cannot play any of them");
            return;	
    	}
        
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
 * 
 * @param cid
 *            ID of the client who is suspected to have forgotten to say UNO
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
 * Updates DOM elements based on the given client list. Disappeared clients will
 * be removed, new will be added, the already existing clients will have their
 * names and deck appearances' updated
 * 
 * @param newClientList
 *            Client list as an array of {id, name}
 */
function setNewClientList(newClientList)
{
    var deckContainer = $('#decks');
    newClientList.forEach(client => {
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
            
            newDeck.find('.sort-btn').click(function(evt)
            {
                sortDeck();
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
 * Requests to play a card from the server, if possible TODO starter card plays
 * 
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

        	if ((card.face === types.FACE.DENY) && (lastPlayedCard.face === types.FACE.DENY))
        	{
        		console.log('deny the previous deny ');      
        		asyncPlay = true;
        	} 
        	else 
        	{
        		console.error("Not current player and card cannot be async played: ", card, lastPlayedCard);
        		return;        	
        	}
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

    cardPendingPlayed = domElem;

    // Handle 0 deck chooser overlay
    if (card.face === 0)
    {
        domElem.append(createDeckChooserOverlay());
        $('.deck:not(.own-deck)').filter(function(idx, elem) {return $(elem).find('.card').length > 0}).append(createDeckChosantOverlay());
        $('.deck-chooser-overlay').click(function(evt)
        {
            let domElem = $(evt.target);
            let parents = domElem.parents('.deck');
            if (parents.length < 1)
            {
                console.error("Could not find parent deck of overlay", domElem);
                return;
            }
            let deckDom = $(parents[0]);

            if (getOwnCardCnt() === 1)
            {
                if ($('.deck:not(.own-deck)').filter(function(idx, elem) {return $(elem).find('.card').length > 0}).length > 1)
                {
                    // At least 2 other players, choose who to swap

                    domElem.toggleClass('chosen-double-zero');
                    let choices = $('.chosen-double-zero');
                    if (choices.length === 2)
                    {
                        // Got both
                        card.cid1 = $(choices[0]).parents('.deck').data('cid');
                        card.cid2 = $(choices[1]).parents('.deck').data('cid');
                        socket.emit('play card', card);
                    }
                }
                else
                {
                    // There is only 1 other player in game, no effect of 0 card
					// as last, just play it

                    // TODO ugly to create then remove overlay
                    $('.card-overlay').remove();
                    socket.emit('play card', card);
                }
            }
            else
            {
                // Simple play of zero card mid game

                $('.card-overlay').remove();
                card.cid = deckDom.data('cid');
                socket.emit('play card', card);
            }

        });
        return;
    }

    if (willSayUnoOnNextCard)
    {
        socket.emit('say uno');
        willSayUnoOnNextCard = false;
        $('#say-uno-' + socket.id).removeClass("toggled");
    }
    socket.emit('play card', card);

}

/**
 * Handles a card pull event
 * 
 * @param cardPull
 */
function pullCard(cardPull)
{
    let cardElem = $(createCard(cardPull.card));
    $('#deck-cards-' + cardPull.cid).append(cardElem);
    cardElem.click(playCard);
}

function arrangeDecks()
{
    // Rotate decks so that own is first, then skip - to preserve the order of
	// the turn around the table
    let otherDecks = $('.deck');
    for (let currentDeck = otherDecks[0]; ! $(currentDeck).hasClass('own-deck'); )
    {
        otherDecks.push(otherDecks.splice(0, 1));
        currentDeck = otherDecks[0];
    }
    otherDecks.splice(0, 1);

    let otherDeckCnt = otherDecks.length;
    let angleDiff = 270 / (otherDeckCnt + 1);
    otherDecks.each(function (idx, deck)
    {
        let rotateAngle = -135 + (angleDiff * (idx + 1));
        while (rotateAngle < 0) rotateAngle += 360;
        console.log("Adjusting ", idx, deck);

        $(deck).css('transform', 'translate(-50%, -50%) rotate(-' + rotateAngle + 'deg) translateY(-40vh) rotate(180deg)');
    });


}

$(function () {
    /**
	 * New client list msg
	 */
    socket.on('client list', function(clientList)
    {
        console.log('client list', clientList);
        setNewClientList(clientList);
        arrangeDecks();
    });
    
    socket.on('turn direction', function(event)
    {
    	console.log("new direction is ", event);
    	if (event == 1) 
    	{
    		$('#directionIndicator').text('\u21BA').removeClass('rotate-right').addClass('rotate-left');
    	}
    	if (event == -1) 
    	{
    		$('#directionIndicator').text('\u21BB').removeClass('rotate-left').addClass('rotate-right');
    	}
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
        $('.card-overlay').remove();
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
        arrangeDecks();
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
	 * Someone legally played a card from his/her deck. Given as {cid,
	 * card{color, face}}
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
        $('.card-overlay').remove();
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
	 * Response from the server when reported someone missing UNO, but (s)he did
	 * say before
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

    socket.on('end game', function()
    {
        console.log('end game');
        log("Vége a játéknak!");
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