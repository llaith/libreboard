Attachments = new FS.Collection("attachments", {
    stores: [
        // XXX Add a new store for cover thumbnails so we don't load big images
        // in the general board view
        new FS.Store.GridFS("attachments")
    ]
});

Attachments.allow({
    insert: function(userId, doc) {
        return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    update: function(userId, doc) {
        return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    remove: function(userId, doc) {
        return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    // We authorize the attachment download either:
    // - if the board is public, everyone (even unconnected) can download it
    // - if the board is private, only board members can download it
    //
    // XXX We have a bug with the userId verification:
    //
    //   https://github.com/CollectionFS/Meteor-CollectionFS/issues/449
    //
    download: function(userId, doc) {
        var query = {
            $or: [
                { 'members.userId': userId },
                { permission: 'public' }
            ]
        };
        return !!Boards.findOne(doc.boardId, query);
    },
    fetch: ['boardId']
});

// XXX Enforce a schema for the Attachments CollectionFS

Attachments.files.before.insert(function(userId, doc) {
    var file = new FS.File(doc);
    doc.userId = userId;

    // If the uploaded document is not an image we need to enforce browser
    // download instead of execution. This is particularly important for HTML
    // files that the browser will just execute if we don't serve them with the
    // appropriate `application/octet-stream` MIME header which can lead to user
    // data leaks. I imagine other formats (like PDF) can also be attack
    // vectors.
    // See https://github.com/libreboard/libreboard/issues/99
    // XXX Should we use `beforeWrite` option of CollectionFS instead of
    // collection-hooks?
    if (! file.isImage()) {
        file.original.type = "application/octet-stream";
    }
});

isServer(function() {
    Attachments.files.after.insert(function(userId, doc) {
        Activities.insert({
            type: 'card',
            activityType: "addAttachment",
            attachmentId: doc._id,
            boardId: doc.boardId,
            cardId: doc.cardId,
            userId: userId
        });
    });

    Attachments.files.after.remove(function(userId, doc) {
        Activities.remove({
            attachmentId: doc._id
        });
    });
});
