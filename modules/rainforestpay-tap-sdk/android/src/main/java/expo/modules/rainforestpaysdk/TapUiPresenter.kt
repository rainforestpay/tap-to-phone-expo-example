package expo.modules.rainforestpaysdk

import android.app.Activity
import android.util.Log
import android.view.ViewGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.rainforestpay.sdk.tap.TapToPhoneInterface
import com.rainforestpay.sdk.tapui.TapUI
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

object TapUiPresenter {
  private val isPresenting = AtomicBoolean(false)
  private val tapColorScheme = lightColorScheme(primary = Color(0xFF5F8A56))

  suspend fun presentTapDialog(
    activity: Activity,
    ttp: TapToPhoneInterface,
    payinConfigId: String
  ): String {
    if (!isPresenting.compareAndSet(false, true)) {
      throw IllegalStateException("Tap UI is already presenting")
    }

    try {
      return withContext(Dispatchers.Main.immediate) {
        suspendCancellableCoroutine { continuation ->
          val contentRoot = activity.findViewById<ViewGroup>(android.R.id.content)
            ?: run {
              continuation.resumeWithException(
                IllegalStateException("Unable to find Android content view for Tap UI")
              )
              return@suspendCancellableCoroutine
            }

          val didComplete = AtomicBoolean(false)
          val overlay = ComposeView(activity).apply {
            layoutParams = ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT
            )
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
            setContent {
              MaterialTheme(colorScheme = tapColorScheme) {
                TapUI(
                  activity = activity,
                  ttp = ttp,
                  payinConfigId = payinConfigId,
                  autoDismissOnComplete = true,
                  onSuccess = {
                    Log.d("CapyshopTapUi", "Tap UI success")
                    if (didComplete.compareAndSet(false, true)) {
                      post {
                        (parent as? ViewGroup)?.removeView(this@apply)
                        continuation.resume("success")
                      }
                    }
                  },
                  onError = { error ->
                    Log.d("CapyshopTapUi", "Tap UI error: $error")
                    if (didComplete.compareAndSet(false, true)) {
                      post {
                        (parent as? ViewGroup)?.removeView(this@apply)
                        continuation.resume(error.message ?: "Unknown Tap to Phone error")
                      }
                    }
                  },
                  onCancel = {
                    Log.d("CapyshopTapUi", "Tap UI cancelled")
                    if (didComplete.compareAndSet(false, true)) {
                      post {
                        (parent as? ViewGroup)?.removeView(this@apply)
                        continuation.resume("cancel")
                      }
                    }
                  }
                )
              }
            }
          }

          contentRoot.addView(overlay)

          continuation.invokeOnCancellation {
            if (didComplete.compareAndSet(false, true)) {
              (overlay.parent as? ViewGroup)?.removeView(overlay)
            }
          }
        }
      }
    } finally {
      isPresenting.set(false)
    }
  }
}
