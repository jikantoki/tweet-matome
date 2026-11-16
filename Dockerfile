FROM php:8.3-apache

# 本番用設定を適用
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# アプリケーションファイルをドキュメントルートに配置
COPY . /var/www/html/

# ファイルのパーミッション設定
RUN chown -R www-data:www-data /var/www/html

# Apacheのポート
EXPOSE 80

CMD ["apache2-foreground"]
