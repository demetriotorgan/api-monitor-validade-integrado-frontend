
import multer from 'multer';

const tiposPermitidos = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!tiposPermitidos.includes(file.mimetype)) {
      callback(
        new Error('Formato inválido. Envie JPEG, PNG ou WebP.'),
      );
      return;
    }

    callback(null, true);
  },
});

export const receberImagem = upload.single('imagem');
