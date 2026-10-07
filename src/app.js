import express from "express";
import {createServer} from "http";
import { Server } from "socket.io";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
// import Stripe from "stripe"
// import { initializeSocketIO } from "./sockets/index.js";
// import { paymentWebhook } from "./controllers/webhook.controller.js";


const app = express();
const server = createServer(app);

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
//     apiVersion: "2023-10-16",
//     appInfo: {
//         name: "Grupio"
//     }
// });


const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URI,
        methods: ["GET", "POST"],
        credentials: true,
    },
});


app.use(compression());

// initializeSocketIO(io);


app.use(
    cors({
        origin: process.env.CLIENT_URI,
        credentials: true,
    })
);


// app.post(
//     "/api/v1/payments/webhook",
//     express.raw({ type: "application/json" }),
//     paymentWebhook
// );



app.use(express.json({limit:"24kb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.use(cookieParser());

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

import userRouter from "./routes/user.routes.js";
import eventRouter from "./routes/event.routes.js";
import likeRouter from "./routes/like.routes.js";
import registerRouter from "./routes/register.routes.js";
import locationRouter from "./routes/location.routes.js";
// import pyamentRouter from "./routes/payment.routes.js";
// import bookingRouter from "./routes/booking.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import categoryRouter from "./routes/category.routes.js";
// import onBoardingRouter from "./routes/stripeOnboarding.routes.js"
import waitlistRouter from "./routes/waitlist.routes.js"
import otherRouter from "./routes/other.routes.js";


app.use("/api/v1/users", userRouter);
app.use("/api/v1/events", eventRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/register", registerRouter);
app.use("/api/v1/google", locationRouter);
app.use("/api/v1/other", otherRouter);
// app.use("/api/v1/payments", pyamentRouter);
// app.use("/api/v1/booking", bookingRouter)
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/category", categoryRouter)
// app.use("/api/v1/stripe", onBoardingRouter);
app.use("/api/v1/waitlist", waitlistRouter);




export { app, server, io};