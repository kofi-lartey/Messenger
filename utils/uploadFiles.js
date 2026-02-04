import multer from "multer";
import cloudinary from "../utils/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";

// Storage for images (jpg, jpeg, png, gif, webp, svg, heic, bmp)
const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/images",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "bmp", "tiff"],
        transformation: [{ width: 1200, height: 1200, crop: "limit" }]
    },
});

// Storage for documents (pdf, doc, docx, xls, xlsx, csv, txt, json)
const documentStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/documents",
        // 1. Remove allowed_formats entirely for documents
        // 2. Set resource_type to 'raw' (this is how Cloudinary handles CSVs/Docs)
        resource_type: "raw",
        // 3. Use public_id to keep the original extension
        public_id: (req, file) => {
            const extension = file.originalname.split('.').pop();
            return `${Date.now()}-${file.originalname.replace(`.${extension}`, '')}`;
        }
    },
});

// Storage for media (images, videos, documents)
const mediaStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "messenger/media",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "heif", "pdf", "mp4", "mov", "avi", "doc", "docx", "txt", "zip"],
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
