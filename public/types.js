(function(exports){

    exports.COLOR = {
        SECRET: -1,
        RED: 0,
        GREEN: 1,
        BLUE: 2,
        YELLOW: 3,
        BLACK: 4
    };

    /**
     * Transforms a given card color to a human readable string (e.g. for logging)
     * @param color The card color
     * @returns {string} The human readable string
     */
    exports.colorToString = function(color)
    {
        switch (color)
        {
            case this.COLOR.SECRET: return "?";
            case this.COLOR.RED: return "Red";
            case this.COLOR.GREEN: return "Green";
            case this.COLOR.BLUE: return "Blue";
            case this.COLOR.YELLOW: return "Yellow";
            case this.COLOR.BLACK: return "Black";
        }
    };

    exports.FACE = {
        SECRET: -1,
        DENY: 10,
        TURNAROUND: 11,
        PLUS2: 12,
        COLORSWITCH: 13,
        PLUS4: 14
    };

    /**
     * Transforms a given card face to a short symbol (e.g. for display on cards)
     * @param face The card face
     * @returns {string} The short symbol
     */
    exports.faceToSymbol = function(face)
    {
        if (typeof face == 'number' && 0 <= face && face <= 9) return face.toString();

        switch (face)
        {
            case this.FACE.SECRET: return "?";
            case this.FACE.DENY: return '\u2298';
            case this.FACE.TURNAROUND: return "<i class=\"material-icons\">sync</i>";
            case this.FACE.PLUS2: return "+2";
            case this.FACE.COLORSWITCH: return "\u25D5";
            case this.FACE.PLUS4: return "+4";
        }
        return "#";
    };

    /**
     * Transforms a given card face to a human readable string (e.g. for logging)
     * @param face The card face
     * @returns {string} The human readable string
     */
    exports.faceToString = function(face)
    {
        if (typeof face == 'number' && 0 <= face && face <= 9) return face.toString();

        switch (face)
        {
            case this.FACE.SECRET: return "?";
            case this.FACE.DENY: return 'Deny';
            case this.FACE.TURNAROUND: return "Turnaround";
            case this.FACE.PLUS2: return "+2";
            case this.FACE.COLORSWITCH: return "Colorswitch";
            case this.FACE.PLUS4: return "+4";
        }
        return "#";
    };

    /**
     * Transforms a given card to a human readable string (e.g. for logging)
     * @param card The card
     * @returns {string} The human readable string
     */
    exports.cardToString = function(card)
    {
        return this.colorToString(card.color) + ' ' + this.faceToString(card.face);
    };

    /**
     * Transforms a given deck of cards to a human readable string (e.g. for logging)
     * @param deck The deck given as array of cards {color, face}
     * @param delim {string} Delimiter between cards, defaults to comma
     * @returns {string} The human readable string
     */
    exports.deckToString = function(deck, delim = ', ')
    {
        let str = "[";
        deck.forEach(card => str += (this.cardToString(card) + delim))
        str = str.substring(0, str.length - delim.length);
        return str + "]";
    };

    exports.CARD_CNT = 108;
    exports.UNO_MAX_CARD_CNT = 2;

    exports.PLAYER_STATE = {
        PLAYING: 1,
        SAID_UNO: 2,
        CALLBACKABLE: 3,
        CALLBACKABLE_SAID_UNO: 4,
        OUT: 5
    };

    /**
     * Transforms the given player state to a human readable string
     * @param {number} state The state
     * @returns {string} The human readable string
     */
    exports.playerStateToString = function(state)
    {
        switch (state)
        {
            case this.PLAYER_STATE.PLAYING: return "playing";
            case this.PLAYER_STATE.SAID_UNO: return "said uno";
            case this.PLAYER_STATE.CALLBACKABLE: return "callbackable";
            case this.PLAYER_STATE.CALLBACKABLE_SAID_UNO: return "callbackable / said uno";
            case this.PLAYER_STATE.OUT: return "out";
        }
        return "???";
    };

    /**
     * Checks whether the given card can be played on top of the other given card,
     * taking into account black cards, even when they are already colored.
     * @param cardToBePlayed Card wanted to be played as {color, face}
     * @param cardOnTo Current top card as {color, face}
     * @returns {boolean} True, if can be played
     */
    exports.cardCanBePlayedOn = function(cardToBePlayed, cardOnTo)
    {
        if (cardToBePlayed.face === this.FACE.PLUS4 || cardToBePlayed.face === this.FACE.COLORSWITCH) return true;
        return cardToBePlayed.color === this.COLOR.BLACK || cardToBePlayed.color === cardOnTo.color || cardToBePlayed.face === cardOnTo.face;
    };

    /**
     * Checks whether the given card can be played on top of the other given card asynchronously (not in one's own turn)
     * @param cardToBePlayed Card wanted to be played as {color, face}
     * @param cardOnTo Current top card as {color, face}
     * @returns {boolean} True, if can be played
     */
    exports.cardCanBeAsyncPlayedOn = function(cardToBePlayed, cardOnTo)
    {
        if (cardToBePlayed.face !== cardOnTo.face) return false;
        if (this.hasChoosableColor(cardToBePlayed)) return true;
        return cardToBePlayed.color === cardOnTo.color;
    };

    /**
     * Checks whether the given card has a choosable (wildcard black) color
     * @param card The card as {color, face}
     * @returns {boolean} True, if a color can be choosen
     */
    exports.hasChoosableColor = function(card)
    {
        return card.color === this.COLOR.BLACK;
    };

    /**
     * Check whether the given card can be a starter card of a game.
     * @param card The card as {color, face}
     * @returns {boolean} True, if can be
     */
    exports.canBeStarterCard = function(card)
    {
        if (card.color === this.COLOR.BLACK) return false;
        if (card.face === 0) return false;
        return Number.isInteger(card.face) && card.face < 10;
    };

    /**
     * Checks whether a client in the given state can be a target of a swap card
     * @param {number} state
     * @returns {boolean}
     */
    exports.canBeTargetOfSwap = function(state)
    {
        return state === this.PLAYER_STATE.PLAYING || state === this.PLAYER_STATE.SAID_UNO;
    }

})(typeof exports === 'undefined'? this['types']={}: exports);