import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Reusable image/video pager with page badge. Consolidates the three divergent
/// carousel copies (feed, catalog card, product details) into one widget.
///
/// Video items render a play affordance; wire [onVideoTap] to an inline player
/// or an external launcher depending on context.
class MediaCarousel extends StatefulWidget {
  final List<String> imageUrls;
  final List<String> videoUrls;
  final double height;
  final BorderRadius borderRadius;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTapImage;
  final ValueChanged<String>? onVideoTap;
  final BoxFit fit;

  const MediaCarousel({
    super.key,
    required this.imageUrls,
    this.videoUrls = const [],
    this.height = 250,
    this.borderRadius = const BorderRadius.all(Radius.circular(AppRadius.lg)),
    this.margin = EdgeInsets.zero,
    this.onTapImage,
    this.onVideoTap,
    this.fit = BoxFit.cover,
  });

  @override
  State<MediaCarousel> createState() => _MediaCarouselState();
}

class _MediaCarouselState extends State<MediaCarousel> {
  int _page = 0;

  int get _itemCount => widget.imageUrls.length + widget.videoUrls.length;

  @override
  Widget build(BuildContext context) {
    if (_itemCount == 0) {
      return Container(
        height: widget.height,
        margin: widget.margin,
        decoration: BoxDecoration(
          borderRadius: widget.borderRadius,
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
        ),
        child: const Center(child: Icon(Icons.image_outlined)),
      );
    }
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: Stack(
        children: [
          PageView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: _itemCount,
            onPageChanged: (value) => setState(() => _page = value),
            itemBuilder: (context, index) {
              final isVideo = index >= widget.imageUrls.length;
              final url = isVideo
                  ? widget.videoUrls[index - widget.imageUrls.length]
                  : widget.imageUrls[index];
              return GestureDetector(
                onTap: () {
                  if (isVideo) {
                    widget.onVideoTap?.call(url);
                  } else {
                    widget.onTapImage?.call();
                  }
                },
                child: Container(
                  margin: widget.margin,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: widget.borderRadius,
                    color: isVideo ? Colors.black87 : null,
                  ),
                  child: isVideo
                      ? Stack(
                          alignment: Alignment.center,
                          children: [
                            if (widget.imageUrls.isNotEmpty)
                              CachedNetworkImage(
                                imageUrl: widget.imageUrls.first,
                                fit: widget.fit,
                                width: double.infinity,
                                color: Colors.black38,
                                colorBlendMode: BlendMode.darken,
                                errorWidget: (_, _, _) =>
                                    const SizedBox.expand(),
                              )
                            else
                              const SizedBox.expand(),
                            const Icon(
                              Icons.play_circle_fill,
                              color: Colors.white,
                              size: 54,
                            ),
                          ],
                        )
                      : CachedNetworkImage(
                          imageUrl: url,
                          fit: widget.fit,
                          width: double.infinity,
                          placeholder: (_, _) => const Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          errorWidget: (_, _, _) => const Center(
                            child: Icon(
                              Icons.image_not_supported,
                              color: Colors.grey,
                              size: 48,
                            ),
                          ),
                        ),
                ),
              );
            },
          ),
          if (_itemCount > 1)
            PositionedDirectional(
              bottom: 10,
              end: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                child: Text(
                  '${_page + 1}/$_itemCount',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
