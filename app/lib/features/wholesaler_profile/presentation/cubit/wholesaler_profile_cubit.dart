import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/errors/network_exception.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/wholesaler_profile_models.dart';
import 'wholesaler_profile_state.dart';

/// Cubit for managing Wholesaler Profile state and fetching data using [INetworkManager].
class WholesalerProfileCubit extends Cubit<WholesalerProfileState> {
  final INetworkManager _networkManager;

  WholesalerProfileCubit({required this._networkManager})
    : super(WholesalerProfileInitial());

  void _emitIfOpen(WholesalerProfileState nextState) {
    if (!isClosed) emit(nextState);
  }

  Future<void> fetchWholesalerProfile(String wholesalerId) async {
    if (isClosed) return;
    _emitIfOpen(WholesalerProfileLoading());

    try {
      // Fetch profile data from B2B backend API
      final profileResponse = await _networkManager.get<Map<String, dynamic>>(
        '/wholesalers/$wholesalerId',
      );
      if (isClosed) return;

      final results = await Future.wait([
        _networkManager.get<Map<String, dynamic>>(
          '/wholesalers/$wholesalerId/posts',
        ),
        _networkManager.get<Map<String, dynamic>>(
          '/wholesalers/$wholesalerId/products',
        ),
        _networkManager.get<Map<String, dynamic>>(
          '/wholesalers/$wholesalerId/reviews',
        ),
      ]);
      if (isClosed) return;
      final postsResponse = results[0]['posts'] as List<dynamic>? ?? const [];
      final productsResponse =
          results[1]['products'] as List<dynamic>? ?? const [];
      final reviewsResponse =
          results[2]['reviews'] as List<dynamic>? ?? const [];

      final profile = WholesalerProfileModel.fromJson(profileResponse);
      final videoPosts = postsResponse
          .map((e) => VideoPostModel.fromJson(e as Map<String, dynamic>))
          .toList();
      final products = productsResponse
          .map((e) => ProductModel.fromJson(e as Map<String, dynamic>))
          .toList();
      final reviews = reviewsResponse
          .map((e) => ReviewModel.fromJson(e as Map<String, dynamic>))
          .toList();

      _emitIfOpen(
        WholesalerProfileLoaded(
          profile: profile,
          videoPosts: videoPosts,
          products: products,
          reviews: reviews,
        ),
      );
    } on NetworkException catch (e) {
      if (isClosed) return;
      _emitIfOpen(WholesalerProfileError(e.message));
    } catch (e) {
      if (isClosed) return;
      final message = ErrorHandler.getUserFriendlyMessage(e);
      _emitIfOpen(WholesalerProfileError(message));
    }
  }
}
