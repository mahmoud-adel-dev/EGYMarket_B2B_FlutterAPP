import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../data/models/wholesaler_profile_models.dart';

/// Performance-Optimized Video Post Widget.
///
/// Implementations:
/// 1. Lazy Initialization: `VideoPlayerController` is instantiated ONLY when the widget enters viewport.
/// 2. Visibility Auto-Play: Plays video automatically when visible percentage > 60%.
/// 3. Immediate Memory Disposal: Disposes controller immediately when scrolled off-screen or widget destroyed.
class VideoPostWidget extends StatefulWidget {
  final VideoPostModel post;

  const VideoPostWidget({super.key, required this.post});

  @override
  State<VideoPostWidget> createState() => _VideoPostWidgetState();
}

class _VideoPostWidgetState extends State<VideoPostWidget> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;
  bool _hasError = false;

  @override
  void dispose() {
    _disposeVideoController();
    super.dispose();
  }

  void _disposeVideoController() {
    if (_controller != null) {
      _controller?.pause();
      _controller?.dispose();
      _controller = null;
      _isInitialized = false;
    }
  }

  Future<void> _initializeVideo() async {
    if (_controller != null || _hasError) return;

    try {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.post.videoUrl),
      );

      _controller = controller;
      await controller.initialize();
      controller.setLooping(true);
      controller.setVolume(0.0); // Default muted for social feed autoplay

      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
        controller.play();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _hasError = true;
        });
      }
      _disposeVideoController();
    }
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    final double visibleFraction = info.visibleFraction;

    if (visibleFraction > 0.6) {
      // Lazy initialize & play when visible
      if (_controller == null) {
        _initializeVideo();
      } else if (_isInitialized && !_controller!.value.isPlaying) {
        _controller!.play();
      }
    } else if (visibleFraction < 0.2) {
      // Pause and release resources when scrolled off-screen to save RAM
      if (_controller != null && _isInitialized) {
        _controller!.pause();
        _disposeVideoController();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return VisibilityDetector(
      key: Key('video_post_${widget.post.id}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        clipBehavior: Clip.antiAlias,
        elevation: 2,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Video / Thumbnail Viewport
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Thumbnail (Shown until video is initialized or if error occurs)
                  CachedNetworkImage(
                    imageUrl: widget.post.thumbnailUrl,
                    width: double.infinity,
                    height: double.infinity,
                    fit: BoxFit.cover,
                    placeholder: (context, url) => Shimmer.fromColors(
                      baseColor: Colors.grey[300]!,
                      highlightColor: Colors.grey[100]!,
                      child: Container(color: Colors.black12),
                    ),
                    errorWidget: (context, url, error) => Container(
                      color: Colors.black87,
                      child: const Icon(
                        Icons.video_library,
                        color: Colors.white54,
                        size: 48,
                      ),
                    ),
                  ),

                  // Video Player (Overlays thumbnail when ready)
                  if (_isInitialized && _controller != null)
                    SizedBox.expand(
                      child: FittedBox(
                        fit: BoxFit.cover,
                        clipBehavior: Clip.hardEdge,
                        child: SizedBox(
                          width: _controller!.value.size.width,
                          height: _controller!.value.size.height,
                          child: VideoPlayer(_controller!),
                        ),
                      ),
                    ),

                  // Loading Overlay
                  if (_controller != null && !_isInitialized && !_hasError)
                    const CircularProgressIndicator(color: Colors.white),

                  // Mute / Sound Toggle Button
                  if (_isInitialized && _controller != null)
                    PositionedDirectional(
                      bottom: 12,
                      end: 12,
                      child: IconButton(
                        icon: Icon(
                          _controller!.value.volume == 0
                              ? Icons.volume_off
                              : Icons.volume_up,
                          color: Colors.white,
                        ),
                        onPressed: () {
                          setState(() {
                            final newVol = _controller!.value.volume == 0
                                ? 1.0
                                : 0.0;
                            _controller!.setVolume(newVol);
                          });
                        },
                      ),
                    ),
                ],
              ),
            ),

            // Caption & Action Stats
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.post.caption,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        Icons.favorite_border,
                        size: 18,
                        color: Colors.grey[600],
                      ),
                      const SizedBox(width: 4),
                      Text('${widget.post.likesCount}'),
                      const SizedBox(width: 16),
                      Icon(
                        Icons.chat_bubble_outline,
                        size: 18,
                        color: Colors.grey[600],
                      ),
                      const SizedBox(width: 4),
                      Text('${widget.post.commentsCount}'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
