(function(exports){

    exports.COLOR = {
        SECRET: -1,
        RED: 0,
        GREEN: 1,
        BLUE: 2,
        YELLOW: 3,
        BLACK: 4
    };

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

    exports.faceToString = function(face)
    {
        if (typeof face == 'number' && 0 <= face && face <= 9) return face.toString();

        switch (face)
        {
            case this.FACE.SECRET: return "?";
            case this.FACE.DENY: return '\u2298';
            case this.FACE.TURNAROUND: return "\u2B6E";
            case this.FACE.PLUS2: return "+2";
            case this.FACE.COLORSWITCH: return "\u25D5";
            case this.FACE.PLUS4: return "+4";
        }
        return "#";
    };

    exports.cardToString = function(card)
    {
        return this.colorToString(card.color) + ' ' + this.faceToString(card.face);
    };

    exports.CARD_CNT = 108;

    exports.cardCanBePlayedOn = function(cardToBePlayed, cardOnTo)
    {
        console.log("cardCanBePlayedOn", cardToBePlayed, cardOnTo);
        // TODO extend with color switcher cards (CSw, +4)
        return cardToBePlayed.color === this.COLOR.BLACK || cardToBePlayed.color === cardOnTo.color || cardToBePlayed.face === cardOnTo.face;
    }

})(typeof exports === 'undefined'? this['types']={}: exports);