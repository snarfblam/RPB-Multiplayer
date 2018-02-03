//@ts-check

var firebase = firebase || {}; // todo: remove this

var firebaseConfig = {
    apiKey: "AIzaSyAyG6Ny610VSLtnHNK6dG2lOFaXujLW0SU",
    authDomain: "rpblack-jack.firebaseapp.com",
    databaseURL: "https://rpblack-jack.firebaseio.com",
    projectId: "rpblack-jack",
    storageBucket: "rpblack-jack.appspot.com",
    messagingSenderId: "1080305949942"
};
firebase.initializeApp(firebaseConfig);
//@ts-ignore
var database = firebase.database();
var provider = new firebase.auth.GoogleAuthProvider();

var userGoogleToken;
var userData;
// if (!firebase.auth().currentUser) {
//     var provider = new firebase.auth.GoogleAuthProvider();
//     firebase.auth().signInWithRedirect(provider);
// }
firebase.auth().getRedirectResult().then(function (result) {
    // The signed-in user info.
    userData = result.user;
    if (userData) {
        // This gives you a Google Access Token. You can use it to access the Google API.
        userGoogleToken = result.credential.accessToken;
    } else {
        var provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithRedirect(provider);
    }
}).catch(function (error) {
    // Handle Errors here.
    var errorCode = error.code;
    var errorMessage = error.message;
    // The email of the user's account used.
    var email = error.email;
    // The firebase.auth.AuthCredential type that was used.
    var credential = error.credential;
    // ...
});
// firebase.auth().signInWithPopup(provider).then(function(result) {
//     // This gives you a Google Access Token. You can use it to access the Google API.
//     userGoogleToken = result.credential.accessToken;
//     // The signed-in user info.
//     userData = result.user;
//     // ...
//   }).catch(function(error) {
//     // Handle Errors here.
//     var errorCode = error.code;
//     var errorMessage = error.message;
//     // The email of the user's account used.
//     var email = error.email;
//     // The firebase.auth.AuthCredential type that was used.
//     var credential = error.credential;
//     // ...
//   });

// OH GOD MY BRAIN IS MELTING IM GOING TO COME BACK TO THIS LATER ON

var RpbGame;

function signOut() {
    firebase.auth().signOut();
}

/** Iterates over an objects own properties. (Similar to a for...in loop, but skips over inherited (prototype) properties.) */
function forEachIn(obj, callback, _this) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            callback.call(_this || this, key, obj[key]); // inherit this function's context if _this is not specified
        }
    }
}


/** Managese communication with firebase
 *  @constructor */
function RpbComm() {
    this.isHosting = false;
    this.myUserKey = null;
    this.myName = "stefan";

    /** An object containing handlers for requests. Property names correspond to message strings. */
    this.requestHandlers = [];
    /** An object containing handlers for actions. Property names correspond to message strings. */
    this.actionHandlers = [];
    /** An object containing handlers for events. */
    this.eventHandlers = [];
    /** The object on whose context request and action handlers will be invoke */
    this.handlerContext = null;

    this.nodes = {
        root: database.ref("rpb"),
        host: database.ref("rpb/host"),
        hostPing: database.ref("rpb/hostPing"),
        players: database.ref("rpb/players"),
        waitingPlayers: database.ref("rpb/requestJoin"),
        requests: database.ref("rpb/requestAction"),
        actions: database.ref("rpb/performAction"),
        bets: database.ref("rpb/bets"),
    };

    this.cached = {
        host: null,
        players: {},
        waitingPlayers: {},
        requests: [],
        actions: [],
        bets: [],
    };
    this.events = {
        playerListChanged: "playerListChanged",
        hostSet: "hostSet",
        waitingListChanged: "waitingListChanged",
    };
    this.getThisPlayer = function getThisPlayer() {
        return this.cached.players[this.myUserKey];
    };

    this.connect = function () {
        var self = this;

        // First and foremost, we're checking who the host is. 
        // If there is no host, we're becoming the host.
        // Else, we're joining as a spectator, at which point we can ask to join the next round

        this.nodes.host.once("value")
            .then(function (snapshot) {
                if (snapshot.val()) {
                    self.joinExistingGame();
                } else {
                    self.createNewGame();
                }

                self.nodes.host.on("value", self.ondb_host_value.bind(self));
                self.nodes.players.on("value", self.ondb_players_value.bind(self));
                self.nodes.requests.on("value", self.ondb_requests_value.bind(self));
                self.nodes.waitingPlayers.on("value", self.ondb_waitingPlayers_value.bind(self));
                self.nodes.actions.on("child_added", self.ondb_actions_childAdded.bind(self));
                self.nodes.bets.on("value", self.ondb_bets_value.bind(self));
            }).catch(function (error) {
                alert(JSON.stringify(error));
            });
    };

    this.updatePlayer = function updatePlayer(playerID, playerData) {
        this.nodes.players.child(playerID).set(playerData);
    };


    this.createNewGame = function () {
        this.isHosting = true;

        // note that the key name "host" carries no significance to the program, it was just convenient and helps identify the host when debugging 
        this.myUserKey = "host"; // todo: move from game to comm
        var dbData = {
            hostPing: firebase.database.ServerValue.TIMESTAMP,
            host: "host",
            players: {
                host: {
                    name: this.myName,
                    balance: 1000,
                }
            },
        };

        this.nodes.root.set(dbData);

        this.beginHostPing();
    };

    this.joinExistingGame = function () {
        this.isHosting = false;
        this.myName = prompt("enter a name. also, replace this with something competent, you turd."); // todo: move from game to comm
        var node = this.nodes.waitingPlayers.push({
            name: this.myName,
            balance: 1000,
        });
        this.myUserKey = node.key;
    };

    this.setChatMessage = function (userID, text) {
        this.nodes.chat.push({
            user: userID,
            text: text,
        });
    };

    this.beginHostPing = function () {
        setInterval(ping.bind(this), 10000);

        function ping() {
            this.nodes.hostPing.set(firebase.database.ServerValue.TIMESTAMP);
            this.nodes.hostPing.once("value").then(function (snap) { console.log(snap.val()); });
        }
    };

    /** Sends a message to the host to request a game action to occur */
    this.dispatchRequest = function (msgString, msgArgObject) {
        var msg = { action: msgString };
        if (msgArgObject) msg.args = msgArgObject;
        this.nodes.requests.push(msg);
    };
    this.startRound = function (msgString, msgArgObject) {
        // var msg = { action: msgString };
        // if (msgArgObject) msg.args = msgArgObject;

        // When we start a new round, we clear out all old requests and actions
        this.nodes.requests.set(null);
        this.nodes.actions.set(null);
        //this.nodes.actions.set({"0": msg});
        this.dispatchAction(msgString, msgArgObject);
    }
    /** Sends a message to clients informing them that a game action has occurred */
    this.dispatchAction = function (msgString, msgArgObjcet) {
        var msg = { action: msgString };
        if (msgArgObjcet) msg.args = msgArgObjcet;
        this.nodes.actions.push(msg);
    };

    this.processRequest = function (msgString, msgArgObject) {
        this.requestHandlers.forEach(function (handlerObject) {
            var handlerFunc = handlerObject[msgString];
            if (handlerFunc) handlerFunc.call(handlerObject.handlerContext || this, msgArgObject);
        }, this);
    };
    this.raiseEvent = function (event, eventArgs) {
        this.eventHandlers.forEach(function (handlerObject) {
            var handler = handlerObject[event];
            if (handler) handler.call(handlerObject.handlerContext, eventArgs);
        }, this);
    };
    this.processAllRequests = function () {
        while (this.cached.requests.length > 0) {
            var msg = this.cached.requests.shift();
            this.processRequest(msg.action, msg.args);
        }
    };

    this.processAction = function (msgString, msgArgObject) {
        this.actionHandlers.forEach(function (handlerObject) {
            var handlerFunc = handlerObject[msgString];
            if (handlerFunc) handlerFunc.call(handlerObject.handlerContext || this, msgArgObject);
        }, this);
    };

    this.ondb_host_value = function (snapshot) {
        console.log("HOST", snapshot.val());
        this.cached.host = snapshot.val();
        this.raiseEvent(this.events.hostSet);
    };
    this.ondb_players_value = function (snapshot) {
        console.log("PLAYERS", snapshot.val());
        this.cached.players = snapshot.val() || {};
        this.raiseEvent(this.events.playerListChanged);
    };
    this.ondb_requests_value = function (snapshot) {
        var val = snapshot.val();
        console.log("REQUEST + ", val);
        var self = this;
        var requestList;

        //this.comm.cached.requests = snapshot.val();
        if (this.isHosting && val) {
            console.log("Initiate transaction for ", snapshot.val());
            // Use a transaction to retreive requests then delete them
            this.nodes.requests.transaction(function (req) {
                console.log("Enter transaction for ", req);
                if (!req) {
                    console.log("Abort transaction for", req);
                    return undefined;
                }

                requestList = req || requestList;
                console.log("requestList = ", req)
                console.log("Set to null for ", req)
                return null;
            })
                .then(function () {
                    console.log("Final request list: ", requestList)
                    self.processRequests.bind(self)(requestList);
                });
        }
    };

    this.processRequests = function processRequests(reqObject) {
        var collection = [];
        forEachIn(reqObject, function (key, value) {
            collection.push(value);
        });
        this.cached.requests = collection;
        this.processAllRequests();
    };
    this.ondb_waitingPlayers_value = function (snapshot) {
        console.log("WAITING + ", snapshot.val());
        this.cached.waitingPlayers = snapshot.val();
        this.raiseEvent(this.events.waitingListChanged);
    };
    this.ondb_actions_childAdded = function (snapshot) {
        console.log("ACTION + ", snapshot.val());
        this.cached.actions = snapshot.val();
        var actionObj = snapshot.val();
        this.processAction(actionObj.action, actionObj.args);
    };
    this.ondb_bets_value = function (snapshot) {
        console.log("BET + ", snapshot.val());
        this.cached.bets = snapshot.val();
    };

}


/** Represents game logic
 * @constructor
 */
function RpbGameLogic() {

    //this.state = this.states.none;
    this.deck = new CardDeck(true, 1);
    this.minimumBet = 1;
    this.maximumBet = 20;
    this.currentBet = null;
    /** Contains player specific data (hand, bet), with user ids as keys */
    this.playerInfo = {
        // .hand: Card[]
        // .bet: number
        // .betPlaced: bool - to be set by placeBet function
    };
    /** @type Card[] */
    this.dealerHand = [];

    /** Must be set to the RpbComm object. Used to get and set player info.
     * @type {RpbComm}
     */
    this.comm = null;

    /** Array of UserIDs */
    this.playerQueue = [];

}
/** The amount, in addition to the original bet, to award to the player for blackjack */
RpbGameLogic.blackjackPayoutRatio = 1.5;
RpbGameLogic.states = {
    none: "None",
    placingBets: "placingBets",
    awaitingPlayers: "awaitingPlayers",
};
RpbGameLogic.messages = {
    placeBet: "placeBet",
    dealCard: "dealCard",
    playerUp: "playerUp",
    hit: "hit",
    stand: "stand",
    bust: "bust",
    dealerBlackjack: "dealerBlackjack",
    balanceChange: "balanceChange",
    playerEvent: "playerEvent",
};
RpbGameLogic.playerResults = {
    blackjack: "blackjack",
    won: "won",
    dealerBlackjack: "dealerBlackjack",
    lost: "lost",
    push: "push",
    bust: "bust",
    dealerBust: "dealerBust",
}
RpbGameLogic.playerEvents = {
    hit: "hit",
    stand: "stand",
    bust: "bust",
    blackjack: "blackjack",
}
RpbGameLogic.prototype.player_getAllowedBet = function player_getMinimumBet() {
    return {
        min: this.minimumBet,
        max: Math.min(this.maximumBet, this.comm.getThisPlayer().balance),
    };
};
RpbGameLogic.prototype.state = RpbGameLogic.states.none; // default value
RpbGameLogic.prototype.initialized = false;
RpbGameLogic.prototype.init = function init() {
    // Lazy initialization
    if (!this.comm) throw Error("RpbGameLogic.comm must be set prior to using the object.");

    this.actionHandlers.handlerContext = this;
    this.requestHandlers.handlerContext = this;
    this.comm.actionHandlers.push(this.actionHandlers);
    this.comm.requestHandlers.push(this.requestHandlers);

    this.initialized = true;
};
/** Prepares a hand be re-initializing player hand data. Bets may be made. No cards will be dealt until
 * dealHand is called.
 */
RpbGameLogic.prototype.host_beginHand = function () {
    this.deck.returnCards();

    if (!this.initialized) this.init();
    this.dealerHand = [];
    this.playerInfo = {};

    forEachIn(this.comm.cached.players, function (key, value) {
        this.playerInfo[key] = {
            bet: this.minimumBet,
            hand: [], // first card is hidden
            betPlaced: false,
        }
    }, this);


    this.state = RpbGameLogic.states.placingBets;
}
RpbGameLogic.prototype.player_beginHand = new function () {

};

RpbGameLogic.prototype.player_placeBet = function (amt) {
    this.currentBet = amt;
    this.comm.dispatchRequest(RpbGameLogic.messages.placeBet, {
        user: this.comm.myUserKey,
        bet: amt
    });
};
RpbGameLogic.prototype.player_hit = function () {
    // validation occurs at host
    this.comm.dispatchRequest(RpbGameLogic.messages.hit, { user: this.comm.myUserKey });
};
RpbGameLogic.prototype.player_stand = function () {
    // validation occurs at host
    this.comm.dispatchRequest(RpbGameLogic.messages.stand, { user: this.comm.myUserKey });
};
/** Gets an object containing only the card's suit and rank. */
RpbGameLogic.prototype.getSimpleCard = function getSimpleCard() {
    var card = this.deck.getCard();
    return { rank: card.rank, suit: card.suit };

}
RpbGameLogic.prototype.toSimpleCard = function toSimpleCard(card) {
    return { rank: card.rank, suit: card.suit };
}
RpbGameLogic.prototype.host_sendPlayerEvent = function host_sendPlayerEvent(user, eventName) {
    this.comm.dispatchAction(RpbGameLogic.messages.playerEvent, {
        user: user,
        event: eventName,
    });
}
RpbGameLogic.prototype.host_initialDeal = function host_initialDeal() {
    // I'm dealing out of order and I don't even care
    this.dealerHand = [this.getSimpleCard(), this.getSimpleCard()];
    this.dealerHand[0].down = true; // dealer shows one card face-down

    this.comm.dispatchAction(RpbGameLogic.messages.dealCard, {
        user: "dealer",
        cards: this.dealerHand,
    });

    forEachIn(this.playerInfo, function (key, value) {
        value.hand = [this.getSimpleCard(), this.getSimpleCard()];
        this.comm.dispatchAction(RpbGameLogic.messages.dealCard, {
            user: key,
            cards: value.hand,
        });

        var blackjack = 21 == CardDeck.getHandTotal(value.hand);
        this.host_sendPlayerEvent(key, RpbGameLogic.playerEvents.blackjack);
    }, this)

    this.state = RpbGameLogic.states.awaitingPlayers;

    var dealerBlackjack = CardDeck.getHandTotal(this.dealerHand) == 21;

    if (dealerBlackjack) {
        this.playerQueue = [];
        this.comm.dispatchAction(RpbGameLogic.messages.dealerBlackjack);
        this.host_concludeRound();
    } else {
        this.playerQueue = Object.getOwnPropertyNames(this.playerInfo);
        var playerHasBlackjack = 21 == CardDeck.getHandTotal(this.playerInfo[this.playerQueue[0]].hand);
        if (playerHasBlackjack) {
            this.host_moveToNextPlayer();
        } else {
            this.comm.dispatchAction(RpbGameLogic.messages.playerUp, { user: this.playerQueue[0] });
        }
    }
}

RpbGameLogic.prototype.host_registerBet = function (userKey, amt) {
    var playerInfo = this.playerInfo[userKey];
    playerInfo.bet = amt;
    playerInfo.betPlaced = true;

    console.log("bet from ", this.comm.cached.players[userKey].name + "/" + userKey);

    // Notify clients
    this.comm.dispatchAction(RpbGameLogic.messages.placeBet, { user: userKey, bet: amt });

    // we're only done betting if all players have placed bets
    var doneBetting = true;
    forEachIn(this.playerInfo, function (key, value) {
        if (!value.betPlaced) doneBetting = false;
    }, this);

    if (doneBetting) {
        this.host_initialDeal();
    }
};
RpbGameLogic.prototype.host_activePlayerHit = function () {
    var user = this.playerQueue[0]
    var info = this.playerInfo[user];
    if (info) {
        var total = CardDeck.getHandTotal(info.hand);
        if (total < 21) {
            var card = this.deck.getCard();
            info.hand.push(card);
            this.comm.dispatchAction(RpbGameLogic.messages.dealCard, {
                user: user,
                cards: [this.toSimpleCard(card)],
            });
            this.host_sendPlayerEvent(user, RpbGameLogic.playerEvents.hit);


            var newTotal = CardDeck.getHandTotal(info.hand);
            if (newTotal > 21) { // bust
                //this.comm.dispatchAction(RpbGameLogic.messages.bust, { user: user });
                this.host_sendPlayerEvent(user, RpbGameLogic.playerEvents.bust);

                this.host_moveToNextPlayer(RpbGameLogic.messages.bust);
            }
        }
    }
}
RpbGameLogic.prototype.host_activePlayerStand = function () {
    // var user = this.playerQueue[0];
    // var info = this.playerInfo[user];
    // if (info) {
    //     this.comm.dispatchAction(RpbGameLogic.messages.stand, { user: user });
    //     this.playerQueue.shift();

    //     if (this.playerQueue.length > 0) {
    //         // next player is up
    //         this.comm.dispatchAction(RpbGameLogic.messages.playerUp, { user: this.playerQueue[0] });
    //     } else {
    //         // dealer is up
    //         var dealerTotal = CardDeck.getHandTotal(this.dealerHand);
    //         while (dealerTotal < 17) {
    //             var newCard = this.deck.getCard();
    //             this.dealerHand.push(newCard);
    //             this.comm.dispatchAction(RpbGameLogic.messages.dealCard, {
    //                 user: "dealer",
    //                 cards: [this.toSimpleCard(newCard)]
    //             });

    //             dealerTotal = CardDeck.getHandTotal(this.dealerHand);
    //         }
    //     }
    // }
    this.host_sendPlayerEvent(this.playerQueue[0], RpbGameLogic.playerEvents.stand);

    this.host_moveToNextPlayer(RpbGameLogic.messages.stand);
};

/** Ends the current player's turn. The specified message is dispatched. 
 * If it becomes the dealer's turn, he plays automatically. 
 * Otherwise a 'playerUp' message is dispatched for the new player. */
RpbGameLogic.prototype.host_moveToNextPlayer = function (message) {
    var user = this.playerQueue[0];
    var info = this.playerInfo[user];
    if (info) {
        if (message) this.comm.dispatchAction(message, { user: user });
        this.playerQueue.shift();

        if (this.playerQueue.length > 0) {
            // skip over any player with blackjack
            var nextPlayer = this.playerQueue[0];
            var nextPlayerHandValue = CardDeck.getHandTotal(this.playerInfo[nextPlayer].hand);
            if (nextPlayerHandValue == 21) {
                this.host_moveToNextPlayer(message);
            } else {
                // next player is up
                this.comm.dispatchAction(RpbGameLogic.messages.playerUp, { user: this.playerQueue[0] });
            }
        } else {
            this.host_performDealerTurn();
        }
    }
};
RpbGameLogic.prototype.host_performDealerTurn = function () {
    this.comm.dispatchAction(RpbGameLogic.messages.playerUp, { user: "dealer" });

    var dealerTotal = CardDeck.getHandTotal(this.dealerHand);
    while (dealerTotal < 17) {
        var newCard = this.deck.getCard();
        this.dealerHand.push(newCard);
        this.comm.dispatchAction(RpbGameLogic.messages.dealCard, {
            user: "dealer",
            cards: [this.toSimpleCard(newCard)]
        });

        dealerTotal = CardDeck.getHandTotal(this.dealerHand);
    }

    this.host_concludeRound();
};
RpbGameLogic.prototype.host_concludeRound = function () {
    var dealerValue = CardDeck.getHandTotal(this.dealerHand);
    var dealerHasBlackjack = dealerValue == 21 && this.dealerHand.length == 2;
    var dealerBust = dealerValue > 21;

    forEachIn(this.playerInfo, function (playerID, player) {
        var playerValue = CardDeck.getHandTotal(player.hand);
        var playerHasBlackjack = playerValue == 21 && player.hand.length == 2;
        var playerBust = playerValue > 21;

        var bet = player.bet;
        var balanceChange, reason;

        if (dealerHasBlackjack) {
            if (playerHasBlackjack) {
                balanceChange = 0;
                reason = RpbGameLogic.playerResults.push;
            } else {
                balanceChange = -bet;
                reason = RpbGameLogic.playerResults.dealerBlackjack;
            }
        } else {
            if (playerHasBlackjack) {
                balanceChange = Math.ceil(bet * RpbGameLogic.blackjackPayoutRatio);
                reason = RpbGameLogic.playerResults.blackjack;
            } else {
                if (playerBust) {
                    balanceChange = -bet;
                    reason = RpbGameLogic.playerResults.bust;
                } else if (dealerBust) {
                    balanceChange = bet;
                    reason = RpbGameLogic.playerResults.dealerBust;
                } else {
                    if (playerValue > dealerValue) {
                        balanceChange = bet;
                        reason = RpbGameLogic.playerResults.won;
                    } else if (playerValue < dealerValue) {
                        balanceChange = -bet;
                        reason = RpbGameLogic.playerResults.lost;
                    } else {
                        balanceChange = 0;
                        reason = RpbGameLogic.playerResults.push;
                    }
                }
            }
        }

        this.host_ChangeUserBalance(playerID, balanceChange, reason);
    }, this); // forEachIn
};
RpbGameLogic.prototype.host_ChangeUserBalance = function host_ChangeUserBalance(playerID, amt, reason) {
    var user = this.comm.cached.players[playerID];
    user.balance += amt;
    this.comm.updatePlayer(playerID, user);

    if (reason) {
        this.comm.dispatchAction(RpbGameLogic.messages.balanceChange, {
            user: playerID,
            amount: amt,
            reason: reason,
        });
    }
}

RpbGameLogic.prototype.requestHandlers = {
    placeBet: function (args) {
        if (this.comm.isHosting) {
            this.host_registerBet(args.user, args.bet);
        }
    },
    hit: function (args) {
        if (this.comm.isHosting) {
            var user = args.user;
            if (this.playerQueue[0] == user) {
                this.host_activePlayerHit();
            }
        }
    },
    stand: function (args) {
        if (this.comm.isHosting) {
            var user = args.user;
            if (this.playerQueue[0] == user) {
                this.host_activePlayerStand();
            }
        }
    }
};
RpbGameLogic.prototype.actionHandlers = {
    placeBet: function (args) {

    },
};

/** Represents a deck of cards
 *  @constructor
 */
function CardDeck(shuffled, numDecks) {
    numDecks = numDecks || 1;

    /** @type {Card[]} */
    this.cards = [];
    /** @type {Card[]} 
     * Cards on the table    */
    this.cardsOut = [];
    /** @type {Card[]} 
     * Cards returned from the table */
    this.returnedCards = [];

    var suits = this.suits = ["hearts", "diamonds", "spades", "clubs"];
    var suitSymbols = this.suitSymbols = ["♥", "♦", "♠", "♣"];
    var ranks = this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    /** @constructor */
    var Card = this.Card = function (rank, suit) {
        this.rank = rank;
        this.rankName = ranks[rank - 1];
        this.suit = suit;
        this.suitName = suits[suit];
        this.suitSymbol = suitSymbols[suit];

    };

    /** Shuffles cards */
    this.shuffle = function () {
        // re-insert returned cards
        Array.prototype.push.apply(this.cards, this.returnedCards);
        this.returnedCards.length = 0;

        // fisher yates
        for (var i = this.cards.length - 1; i > 0; i--) {
            var iSwap = Math.floor(Math.random() * (i + 1));
            var tmp = this.cards[iSwap]
            this.cards[iSwap] = this.cards[i];
            this.cards[i] = tmp;
        }
    };

    /** Removes one card from the deck and returns it. 
     * @returns Card
    */
    this.getCard = function () {
        if (this.cards.length == 0) {
            this.shuffle();
        }

        var result = this.cards.pop();
        // Place card 'on table'
        this.cardsOut.push(result);
        return result;
    }

    /** Re-adds any dealt cards back into the deck for the next shuffle */
    this.returnCards = function () {
        // Take cards 'on the table' and put them in the return pile
        Array.prototype.push.apply(this.returnedCards, this.cardsOut);
        this.cardsOut.length = 0;
    }

    for (var iDeck = 0; iDeck < numDecks; iDeck++) {
        for (var rank = 1; rank <= 13; rank++) {
            for (var suit = 0; suit < 4; suit++) {
                this.cards.push(new Card(rank, suit));
            }
        }
    }
    if (shuffled) this.shuffle();
}

// Helper methods
CardDeck.suitSymbols = ["♥", "♦", "♠", "♣"];
CardDeck.rankNames = [undefined, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
CardDeck.suitNames = ["hearts", "diamonds", "spades", "clubs"];
CardDeck.getSuitName = function getSuitName(suit) {
    return CardDeck.suitNames[suit] || "[suit: " + (suit || "") + "]";
};
CardDeck.getSuitSymbol = function getSuitSymbol(suit) {
    return CardDeck.suitSymbols[suit] || "[suit: " + (suit || "") + "]";
};
CardDeck.getRankName = function getRankName(rank) {
    return CardDeck.rankNames[rank] || "[rank: " + (rank || "") + "]";
};
CardDeck.getHandTotal = function getDeckTotal(cards) {
    var total = 0;
    var aceCount = 0;
    cards.forEach(function (card) {
        if (card.rank == 1) {
            aceCount++;
            total++;
        } else if (card.rank >= 10) {
            total += 10;
        } else {
            total += card.rank;
        }
    });

    while (aceCount > 0 && total <= 11) {
        aceCount--;
        total += 10;
    }

    return total;
}




$(document).ready(function () {
    $(window).resize(function () {
        var containerHeight = $("#chat-container").height();
        $("#chat-container-placeholder").height(containerHeight);
    });

    var rpbGame = {
        comm: new RpbComm(),
        game: new RpbGameLogic(),


        randomUserAdjectives: [
            "contemplative", "questionable", "unsavory", "unpredictable", "charming",
            "offsensive", "articulate", "conniving", "plotting", "inscrutable", "mysterious",
            "intimidating", "laughable", "boastful", "arrogant", "mean-spirited", "amenable",
            "hilariouis", "boring", "lifeless", "furious", "confused", "agitated", "jumpy",
            "fussy", "hesitant", "anxious", "volatile", "timid", "confident", "dashing",
            "gallant", "spunky", "virile", "immature", "cultured", "clairvoyant", "perveptive",
            "thoughtful", "worldy", "insightful", "eccentric", "bizarre", "whimsical", "mischievous",
        ],
        randomUserNouns: [
            "interloper", "animal", "baby", "charlatan", "communist", "dreamr", "deadbeat", "devil",
            "drifter", "delinquent", "bro", "failure", "friend", "follower", "freak", "genius",
            "goofball", "grandmother", "grump", "heathen", "hero", "high-roller", "hipster", 
            "hypocrate", "politician", "invalid", "jerk", "lawyer", "leader", "liar",
            "loudmouth", "lover", "mastermind", "maker", "menace", "misfit", "nobody", 
            "pacifist", "party pooper", "patriot", "pessimist", "pioneer", "player", "professional",
            "phychic", "punk", "saint", "show-off", "skeptic", "spectator", "star", "sucker",
            "sweetheart", "theif", "tormentor", "traitor", "traveler", "president", "user",
            "vinicator", "avenger", "weasel", "wizard", "protector", "humanitarian",
        ],

        messages: {
            startGame: "startGame",
            chat: "chat",
        },

        ui: {
            hostDisplay: $("#host-name"),
            waitingDisplay: $("#waiting"),
            playingDisplay: $("#playing"),
            startGame: $("#start-game"),
            playerContainer: $("#player-container"),
            placeBet: $("#place-bet"),
            myBet: $("#my-bet"),
            status: $("#status"),
            playerHit: $("#player-hit"),
            playerStand: $("#player-stand"),
            chatButton: $("#chat-button"),
            chatInput: $("#chat-input"),
            chatBox: $("#chat-box"),
        },

        /** List of symbol-position-lists to be used on each card */
        cardSymbolLayouts: [
            [], // Rank 0 is unused
            // [ 0]  [13]  [ 2]  Don't even ask why they're in this order
            //       [ 4]      
            // [ 1]        [ 3]
            // [11]  [ 5]  [12]
            // [ 6]        [ 8]
            //       [10]       
            // [ 7]  [14]  [ 9]
            [5],
            [13, 14],
            [13, 14, 5],
            [0, 2, 7, 9],
            [0, 2, 7, 9, 5],
            [0, 2, 7, 9, 11, 12],
            [0, 2, 7, 9, 11, 12, 4],
            [0, 2, 7, 9, 11, 12, 4, 10],
            [0, 2, 1, 3, 6, 8, 7, 9, 5],
            [0, 2, 1, 3, 6, 8, 7, 9, 4, 10],
            [], [], [], // J/Q/K
        ],

        init: function () {
            var self = this;
            $(window).on("unload", function (e) {
                // Todo: notify server (especially if host)
            });

            this.requestHandlers.handlerContext = this;
            this.actionHandlers.handlerContext = this;
            this.commEventHandlers.handlerContext = this;
            this.comm.requestHandlers.push(this.requestHandlers);
            this.comm.actionHandlers.push(this.actionHandlers);
            this.comm.eventHandlers.push(this.commEventHandlers);

            this.game.comm = this.comm;


            self.comm.connect();

            this.ui.startGame.on("click", this.on_startGame_click.bind(this));
            this.ui.placeBet.on("click", this.on_placeBet_click.bind(this));
            this.ui.playerHit.on("click", this.on_playerHit_click.bind(this));
            this.ui.playerStand.on("click", this.on_playerStand_click.bind(this));

            this.ui.chatButton.on("click", this.on_chatButton_click.bind(this));
        },
        AddChatMessage: function(user, text) {
            var newText = $("<p>");
            if(user) newText.append($("<strong>").text(user + ": "));
            newText.append($("<span>").text(text));
            this.ui.chatBox.append(newText);
            this.ui.chatBox.scrollTop(this.ui.chatBox[0].scrollHeight);
        },
        getThisPlayer: function () {
            return (this.comm.cached.players || {})[this.comm.myUserKey];
        },
        getHostPlayer: function () {
            return (this.comm.cached.players || {})[this.comm.cached.host];
        },

        createPlayerElement: function (id, displayName, classString, balance) {
            var resultDiv = $("<div>").attr("id", id).addClass(classString);

            var statusSpan = $("<span class='player-status'>");
            var totalSpan = $("<span class='player-total'>").text("[ ]");
            var playerHeader = $("<p>")
                .addClass("player-box-header")
                .text(displayName)
                .append(statusSpan)
                .append(totalSpan);

            var balanceSpan = $("<span class='player-balance'>$" + balance + "</span>");
            var betSpan = $("<span class='player-bet'></span>");
            var playerMoney = $("<p>")
                .addClass("player-money")
                .append(balanceSpan)
                .append(betSpan);

            resultDiv.append(playerHeader);
            resultDiv.append(playerMoney);
            resultDiv.append("<hr>");
            resultDiv.append($("<div>").addClass("cardContainer"));
            return resultDiv;
        },
        createCardElement: function (card) {
            var cardSymbol = CardDeck.suitSymbols[card.suit];
            var cardHtmlUL =
                "<span class='card-value'>" +
                CardDeck.rankNames[card.rank] +
                "</span><br>" + cardSymbol;
            var cardHtmlBR =
                CardDeck.rankNames[card.rank] +
                "<br>" + cardSymbol;

            var div = $("<div>").addClass("playing-card card-suit-" + card.suit);
            var numDivUL = $("<div>").addClass("playing-card-UL").html(cardHtmlUL);
            var numDivBR = $("<div>").addClass("playing-card-BR").html(cardHtmlBR);

            if (card.down) div.addClass("card-down");
            if (card.rank == 11) div.addClass("card-jack");
            if (card.rank == 12) div.addClass("card-queen");
            if (card.rank == 13) div.addClass("card-king");

            div.append(numDivUL).append(numDivBR);
            var symbols = this.cardSymbolLayouts[card.rank];
            symbols.forEach(function (positionNumber) {
                var symbolDiv = $("<div>").addClass("sym" + positionNumber + " card-symbol");
                symbolDiv.text(cardSymbol)
                div.append(symbolDiv);
            }, this);

            return div;
        },

        allCardsFaceUp: function () {
            $(".card-down").removeClass("card-down");
        },

        getPlayerDiv: function (user) {
            if (user == "dealer") return $("#dealer");
            return $("#" + user);
        },


        /** Sends a message to all clients, including the sender */
        requestHandlers: {
            startGame: function (args) {
                if (this.comm.isHosting) {
                    this.comm.startRound(this.messages.startGame);
                }
            },
            chat: function (args) {
                if (this.comm.isHosting) {
                    this.comm.dispatchAction(this.messages.chat, args);
                }
            }
        },

        actionHandlers: {
            startGame: function (args) {
                this.ui.playerContainer.empty();

                var dealerDiv = this.createPlayerElement("dealer", "dealer", "player-box dealer-box", " ∞");
                this.ui.playerContainer.append(dealerDiv);

                forEachIn(this.comm.cached.players, function (key, value) {
                    var player = value;
                    var balance = player.balance;

                    var div = this.createPlayerElement(key, player.name, "player-box", balance);
                    this.ui.playerContainer.append(div);
                }, this);

                var thisPlayer = this.getThisPlayer(); // todo: remove this function and use this.comm.getThisPlayer
                var host = this.getHostPlayer();
                if (thisPlayer) {
                    // var minBasedOnBalance = Math.max(thisPlayer.balance, 1); // if you have negative balance, can still bet 1
                    // var maxBasedOnBalance = Math.min(, thisPlayer.balance); // can't bet more than you have
                    var allowedBet = this.game.player_getAllowedBet();
                    this.ui.placeBet.attr("min", allowedBet.min);
                    this.ui.placeBet.attr("max", allowedBet.max);
                    this.ui.placeBet.val(allowedBet.min);
                }
                if (this.comm.isHosting) {
                    this.game.host_beginHand();
                }
            },
            chat: function (args) {
                var user = this.comm.cached.players[args.user];
                if (!user) user = this.comm.cached.waitingPlayers[args.user];
                var userName = user.name;
                if (userName) {
                    this.AddChatMessage(userName, args.text);
                }
            },
            placeBet: function (args) {
                this.getPlayerDiv(args.user).find(".player-bet").text("Bet: $" + args.bet);
            },
            dealCard: function onDealCard(args) {
                var userDiv;
                if (args.user == "dealer") {
                    userDiv = $("#dealer");
                } else {
                    userDiv = $("#" + args.user);
                }

                var cardContainer = userDiv.find(".cardContainer");
                var totalCardCount = userDiv.find(".playing-card").length;
                var firstCards = (totalCardCount == 0);
                totalCardCount += args.cards.length;

                (args.cards || []).forEach(function (card) {
                    //cardContainer.append($("<span>").text(CardDeck.getRankName(card.rank) + CardDeck.getSuitSymbol(card.suit)));
                    cardContainer.append(this.createCardElement(card));
                }, this);

                if (firstCards) {
                    cardContainer.append($("<div>").addClass("card-spacer"));
                }

                var cardValues = cardContainer.find(".card-value");
                var total = 0;
                var soft = false;
                cardValues.each(function (index, elem) {
                    var value = elem.innerText;
                    if (value == 'A') {
                        total += 1;
                        soft = true;
                    } else if (value == 'J' || value == 'Q' || value == 'K') {
                        total += 10;
                    } else {
                        total += parseInt(value);
                    }
                });

                if (soft) {
                    if (total <= 11) {
                        total += 10;
                    } else {
                        soft = false;
                    }
                }

                var hiddenCards = userDiv.find(".card-down").length > 0;

                var totalHtml = "[ " + total.toString() + " ]";
                if (soft) totalHtml = "<em>" + totalHtml + "</em>";
                if (hiddenCards) totalHtml = "[ ? ]";
                userDiv.find(".player-total").html(totalHtml)

                if (totalCardCount == 2 && total == 21) {
                    userDiv.find(".player-status").text(" - Blackjack!");
                } else if (total > 21) {
                    userDiv.find(".player-status").text(" - Bust!");
                }
            },
            playerUp: function onPlayerUp(args) {
                var name;
                if (args.user == "dealer") {
                    name = "dealer";
                    this.allCardsFaceUp();
                } else {
                    name = this.comm.cached.players[args.user].name;
                }
                this.ui.status.text(name + " is up!");

                $(".player-up").removeClass("player-up");
                this.getPlayerDiv(args.user).addClass("player-up");
            },
            balanceChange: function onBalanceChange(args) {
                var name = this.comm.cached.players[args.user].name;
                var balance = this.comm.cached.players[args.user].balance;
                this.ui.status.append($("<p>").text(name + ": " + args.amount + " -> " + balance + " (" + args.reason + ")"));
            },
            dealerBlackjack: function (args) {
                this.allCardsFaceUp();
            },
        },

        commEventHandlers: {
            hostSet: function () {
                this.updateHostDisplay();
            },
            playerListChanged: function () {
                this.updateHostDisplay();
                this.updatePlayingDisplay();
            },
            waitingListChanged: function () {
                this.updateWaitingDisplay();
            },
        },
        on_placeBet_click: function (e) {
            //@ts-ignore
            var bet = parseInt(this.ui.myBet.val()) || 1;
            this.game.player_placeBet(bet);
        },
        on_playerHit_click: function on_playerHit_click(e) {
            this.game.player_hit();
        },
        on_playerStand_click: function on_playerStand_click(e) {
            this.game.player_stand();
        },
        on_startGame_click: function (e) {
            var self = this;
            var promises = [];

            // move users from waiting list to playing
            var waitList = this.comm.cached.waitingPlayers;
            var waitingPromise = this.comm.nodes.waitingPlayers.set({});
            promises.push(waitingPromise);

            forEachIn(waitList, function (key, value) {
                var invalid = (!key || !value);
                if (!invalid) { // if your name is "", you don't get to play. ¯\_(ツ)_/¯
                    var newPlayerPromise = this.comm.nodes.players.child(key).set(value);
                    promises.push(newPlayerPromise);
                }
            }, this);

            // Send the 'begin game' message when all users have been moved around.
            Promise.all(promises)
                .then(function (e) {
                    self.comm.dispatchRequest(self.messages.startGame);
                });
        },

        on_chatButton_click: function (e) {
            e.preventDefault();
            var text = this.ui.chatInput.val();
            this.ui.chatInput.val("");
            this.comm.dispatchRequest(this.messages.chat, {
                user: this.comm.myUserKey,
                text: text,
            });
        },

        updateHostDisplay: function () {
            var hostInfo = this.comm.cached.players[this.comm.cached.host];
            if (hostInfo) {
                this.ui.hostDisplay.text(hostInfo.name);
            }
        },
        updateWaitingDisplay: function () {
            this.updateUserList(this.ui.waitingDisplay, this.comm.cached.waitingPlayers);
        },
        updatePlayingDisplay: function () {
            this.updateUserList(this.ui.playingDisplay, this.comm.cached.players);
        },
        updateUserList: function (jqElement, object) {
            var displayString = "";
            forEachIn(object, function (key, value) {
                if (displayString) displayString += ", ";
                displayString += value.name;
            });
            jqElement.text(displayString);
        },
    };

    RpbGame = rpbGame;
    RpbGame.init();
});
