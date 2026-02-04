import multer from "multer";
import cloudinary from "../utils/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";

// Storage for images (jpg, jpeg, png, gif)
const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/images",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
        transformation: [{ width: 1200, height: 1200, crop: "limit" }]
    },
});

// Storage for documents (pdf, doc, docx, xls, xlsx, csv)
const documentStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/documents",
        allowed_formats: ["pdf", "doc", "docx", "xls", "xlsx", "csv"],
        resource_type: "auto"
    },
});

// Storage for media (images, videos, documents)
const mediaStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/media",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "pdf", "mp4", "mov", "avi"],
        resource_type: "auto"
    },
});

// Middleware for multiple image uploads
export const multipleImages = multer({ storage: imageStorage }).array("images", 5);

// Middleware for single image upload
export const singleImage = multer({ storage: imageStorage }).single("image");

// Middleware for CSV/bulk file uploads
export const csvUpload = multer({ storage: documentStorage }).single("file");

// Middleware for broadcast media (images, videos, documents)
export const broadcastMedia = multer({ storage: mediaStorage }).single("media");

// Middleware for multiple file types
export const mixedUpload = multer({ storage: mediaStorage }).fields([
    { name: "media", maxCount: 1 },
    { name: "csv", maxCount: 1 }
]);
