const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- 1. CONFIG & DATABASE CONNECTION ---
const API_KEY = "f3a98def-7aae-46cc-b98f-e7a5ccb44eb4";
const dbURI = "mongodb+srv://icecorporationlimited_db_user:eP7yunfdthqv6I4B@cluster0.ryordna.mongodb.net/SatteBaazDB?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(dbURI)
    .then(() => console.log("🔥 Connection Success: Cloud Database Active!"))
    .catch(err => console.log("❌ Connection Failed: ", err));

// --- 2. USER SCHEMA ---
const userSchema = new mongoose.Schema({
    username: String,
    balance: { type: Number, default: 1000 },
    bets: Array,
    referralCode: { type: String, sparse: true, unique: true }, 
    deviceId: String 
});

// 🔥 YE LINE MISSING HAI, ISE ZAROOR DALO 🔥
const User = mongoose.model('User', userSchema); 

// Iske BAAD hi saare routes (app.post, app.get) aane chahiye


// --- 3. API: Login Section ---
app.post('/login', async (req, res) => {
    try {
        const { name, referCode, deviceId } = req.body;
        let user = await User.findOne({ username: name });

        if (!user) {
            let startBalance = 1000;
            const deviceExists = await User.findOne({ deviceId: deviceId });
            
            if (referCode && !deviceExists && referCode !== name) {
                const referrer = await User.findOne({ referralCode: referCode });
                if (referrer) {
                    referrer.balance += 50; 
                    await referrer.save();
                    startBalance += 50; 
                }
            }

            const newReferCode = "SZ" + Math.floor(1000 + Math.random() * 9000);

            user = new User({ 
                username: name, 
                balance: startBalance, 
                referralCode: newReferCode,
                deviceId: deviceId || "default_id", 
                bets: [] 
            });
            await user.save();
        }
        res.json(user);
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ msg: "Registration failed. Try different name." });
    }
});


// --- 4. API: Live Matches Fetch karne ka Route ---
app.get('/get-live-ipl', (req, res) => {
    try {
        const data = fs.readFileSync('matches.json', 'utf8');
        const allMatches = JSON.parse(data);
        const today = new Date().toISOString().split('T')[0];

        // Filter: Purane matches automatic gayab ho jayenge
        const activeMatches = allMatches.filter(m => m.date >= today);
        res.json(activeMatches);
    } catch (err) {
        res.status(500).json({ msg: "Matches load nahi ho paye" });
    }
});


// --- 5. API: Bet Lagane Ka Logic ---
app.post('/place-bet', async (req, res) => {
    const { name, team, amount } = req.body;
    let user = await User.findOne({ username: name });
    
    if (!user || user.balance < amount) return res.status(400).json({ msg: "Paise kam hain!" });

    user.balance -= amount;
    user.bets.push({ team, amount, status: 'pending', date: new Date() });
    await user.save();

    res.json({ msg: "Bet Lag Gayi!", newBalance: user.balance, user: user });
});
//--- 6. Leaderboard ---
app.get('/get-leaderboard', async (req, res) => {
    try {
        // Sirf unhe dikhao jinka balance top par hai
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const leaderboard = topUsers.map(u => ({
            name: u.username,
            balance: u.balance
        }));
        res.json(leaderboard);
    } catch (err) {
        console.error("Leaderboard Error:", err);
        res.status(500).json([]); // Error par khali list bhejo, popup nahi aayega
    }
});



// --- 7. API: Winner Declare & Payout Logic ---
app.post('/declare-winner', async (req, res) => {
    const { winner } = req.body;
    const users = await User.find({});

    for (let user of users) {
        let changed = false;
        
        user.bets.forEach((bet) => {
            if (bet.status === 'pending') {
                if (bet.team === winner) {
                    let winningAmount = bet.amount * 2;
                    let commission = winningAmount * 0.10;
                    user.balance += (winningAmount - commission);
                    bet.status = 'won';
                } else {
                    bet.status = 'lost';
                }
                changed = true;
            }
        });

        if (changed) {
            user.markModified('bets');
            await user.save();
        }
    }

    res.json({ msg: `Winner Team ${winner} declare ho gaya! Sabka balance update ho chuka hai.` });
});

// --- 8. Feed --- 
// Database mein Messages ka table (Schema)
const MessageSchema = new mongoose.Schema({
    user: String,
    text: String,
    time: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// Message bhejne ka route
app.post('/send-msg', async (req, res) => {
    const { user, text } = req.body;
    const newMsg = new Message({ user, text });
    await newMsg.save();
    res.json({ msg: "Sent" });
});

// Saare messages mangwane ka route
app.get('/get-msgs', async (req, res) => {
    const msgs = await Message.find().sort({ time: -1 }).limit(20);
    res.json(msgs);
});

// --- 9. P2P SYSTEM --- 
const ChallengeSchema = new mongoose.Schema({
    creator: String,
    acceptor: String,
    amount: Number,
    condition: String,
    status: { type: String, default: 'open' },
    winner: String
});
const Challenge = mongoose.model('Challenge', ChallengeSchema);

// A. Shart Banane Ka Route (Ye tere code mein missing tha)
app.post('/create-challenge', async (req, res) => {
    try {
        const { user, amount, condition } = req.body;
        const userData = await User.findOne({ username: user });

        if (!userData || userData.balance < amount) {
            return res.status(400).json({ msg: "Paise kam hain bhai!" });
        }

        userData.balance -= amount;
        await userData.save();

        const newChallenge = new Challenge({ creator: user, amount, condition });
        await newChallenge.save();
        res.json({ msg: "🔥 Lalkaar Live ho gayi!", newBalance: userData.balance });
    } catch (err) {
        res.status(500).json({ msg: "Challenge create nahi ho paya" });
    }
});

// B. Shartein Dekhne Ka Route (Sirf Ek baar rakho)
app.get('/get-challenges', async (req, res) => {
    try {
        const allChallenges = await Challenge.find({ status: 'open' }).sort({ _id: -1 });
        res.json(allChallenges);
    } catch (err) {
        res.status(500).json([]);
    }
});

// C. Accept Karne Ka Route
app.post('/accept-challenge', async (req, res) => {
    try {
        const { challengeId, user } = req.body;
        const challenge = await Challenge.findById(challengeId);
        const acceptor = await User.findOne({ username: user });

        if (!challenge || challenge.status !== 'open') return res.status(400).json({ msg: "Ye shart purani ho gayi!" });
        if (acceptor.username === challenge.creator) return res.status(400).json({ msg: "Apni hi shart accept karoge?" });
        if (acceptor.balance < challenge.amount) return res.status(400).json({ msg: "Paise kam hain!" });

        acceptor.balance -= challenge.amount;
        await acceptor.save();

        challenge.acceptor = user;
        challenge.status = 'active';
        await challenge.save();

        res.json({ msg: "🤝 Shart Pakki! Match khatam hone ka wait karo." });
    } catch (err) {
        res.status(500).json({ msg: "Accept Error" });
    }
});

// --- ADMIN: P2P Winner Declare Karne Ka Route ---
app.post('/declare-p2p-winner', async (req, res) => {
    try {
        const { challengeId, winnerName } = req.body;
        const challenge = await Challenge.findById(challengeId);

        if (!challenge || challenge.status !== 'active') {
            return res.status(400).json({ msg: "Shart pehle hi khatam ho chuki hai!" });
        }

        // Winner ko dhundo
        const winner = await User.findOne({ username: winnerName });
        if (!winner) return res.status(404).json({ msg: "Winner nahi mila!" });

        // Payout Calculation (10% Admin Commission kaat ke)
        let totalPool = challenge.amount * 2;
        let commission = totalPool * 0.10; 
        let finalPrize = totalPool - commission;

        winner.balance += finalPrize;
        await winner.save();

        // Shart close karo
        challenge.status = 'completed';
        challenge.winner = winnerName;
        await challenge.save();

        res.json({ msg: `🏆 ${winnerName} ko ₹${finalPrize} bhej diye gaye hain! (Comm: ₹${commission})` });
    } catch (err) {
        res.status(500).json({ msg: "P2P Winner declare karne mein error!" });
    }
});

// Admin ko saari active shartein dikhane ke liye
app.get('/admin/get-active-challenges', async (req, res) => {
    const activeOnes = await Challenge.find({ status: 'active' });
    res.json(activeOnes);
});


// --- 10. SERVER START ---
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 SatteBaaz Pro Server Live: http://localhost:${PORT}`));
