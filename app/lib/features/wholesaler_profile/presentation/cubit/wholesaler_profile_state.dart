import 'package:flutter/foundation.dart';
import '../../data/models/wholesaler_profile_models.dart';

@immutable
abstract class WholesalerProfileState {}

class WholesalerProfileInitial extends WholesalerProfileState {}

class WholesalerProfileLoading extends WholesalerProfileState {}

class WholesalerProfileLoaded extends WholesalerProfileState {
  final WholesalerProfileModel profile;
  final List<VideoPostModel> videoPosts;
  final List<ProductModel> products;
  final List<ReviewModel> reviews;

  WholesalerProfileLoaded({
    required this.profile,
    required this.videoPosts,
    required this.products,
    required this.reviews,
  });
}

class WholesalerProfileError extends WholesalerProfileState {
  final String message;

  WholesalerProfileError(this.message);
}
