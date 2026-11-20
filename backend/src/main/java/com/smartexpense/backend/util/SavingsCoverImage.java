package com.smartexpense.backend.util;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;

public final class SavingsCoverImage {
    private static final String PREFIX = "data:image/jpeg;base64,";
    private static final int MAX_BYTES = 220 * 1024;
    private static final int MAX_EDGE = 960;
    public static final int MAX_DATA_LENGTH = 300_399;

    private SavingsCoverImage() {}

    public static byte[] decode(String dataUrl) {
        if (dataUrl == null) return null;
        if (!dataUrl.startsWith(PREFIX) || dataUrl.length() > MAX_DATA_LENGTH) throw invalidImage();
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(dataUrl.substring(PREFIX.length()));
        } catch (IllegalArgumentException invalid) {
            throw invalidImage();
        }
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalidImage();

        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalidImage();
            var reader = readers.next();
            try {
                if (!"JPEG".equalsIgnoreCase(reader.getFormatName())) throw invalidImage();
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) throw invalidImage();
                var image = reader.read(0);
                // Mã hóa lại pixel để bỏ metadata và giữ dung lượng của ảnh đã lưu.
                for (float quality : new float[]{0.76f, 0.58f, 0.40f}) {
                    var encoded = new ByteArrayOutputStream();
                    try (var output = new MemoryCacheImageOutputStream(encoded)) {
                        var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
                        try {
                            writer.setOutput(output);
                            var parameters = writer.getDefaultWriteParam();
                            parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                            parameters.setCompressionQuality(quality);
                            writer.write(null, new IIOImage(image, null, null), parameters);
                        } finally {
                            writer.dispose();
                        }
                    }
                    if (encoded.size() <= MAX_BYTES) return encoded.toByteArray();
                }
                throw invalidImage();
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException invalid) {
            throw invalidImage();
        }
    }

    private static ResponseStatusException invalidImage() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ảnh mục tiêu không hợp lệ. Hãy chọn lại ảnh.");
    }
}
