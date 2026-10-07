import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
        },
        type: {
            type: String,
            enum: [
                "NEW_EVENT",
                "EVENT_REGISTERED",
                "EVENT_UPDATED",
                "EVENT_CANCELLED",
                "EVENT_REMINDER",
                "EVENT_LIKED",
                "CO_HOST_INVITED",
                "USER_WELCOME",
                "ONBOARDING_COMPLETED",
                "STRIPE_ONBOARDING_COMPLETED",
                "PAYMENT_SUCCEEDED", 
                "PAYMENT_FAILED", 
                "PAYMENT_REFUNDED",
            ],
            required: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 100,
        },
        message: {
            type: String,
            required: true,
            maxlength: 500,
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
        },
        isDelivered: {
            type: Boolean,
            default: false,
            index: true,
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });



notificationSchema.statics.getUnreadCount = function (userId) {
    return this.countDocuments({ user: userId, isRead: false });
};

notificationSchema.statics.markAllAsRead = function (userId) {
    return this.updateMany({ user: userId, isRead: false }, { isRead: true });
};

notificationSchema.statics.markOneRead = function (notificationId,userId,) {
    return this.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { isRead: true, readAt: new Date() },
        { new: true }
    );
};

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
